package catalogcache

import (
	"context"
	"encoding/gob"
	"errors"
	"fmt"
	"io"
	"iter"
	"log/slog"
	"os"
	"path/filepath"
	"sync"
	"time"

	"github.com/querylane/querylane/backend/aip"
)

// Keep the widest paged catalog insert well below PostgreSQL's 65,535 bind
// parameter limit while bounding the live and mapped rows retained in memory.
const syncPageSize = 1000

const (
	maxCatalogSpoolBytes = 512 << 20
	staleCatalogSpoolAge = 24 * time.Hour
)

var (
	errCatalogSpoolBudgetExceeded = errors.New("catalog page spool byte budget exceeded")
	activeCatalogSpoolBudget      = newCatalogSpoolByteBudget(maxCatalogSpoolBytes)
	staleCatalogSpoolCleanup      sync.Once
)

type catalogSpoolByteBudget struct {
	mu   sync.Mutex
	used int64
	max  int64
}

func newCatalogSpoolByteBudget(maxBytes int64) *catalogSpoolByteBudget {
	return &catalogSpoolByteBudget{max: maxBytes}
}

func (b *catalogSpoolByteBudget) reserve(bytes int64) bool {
	b.mu.Lock()
	defer b.mu.Unlock()

	if bytes < 0 || b.used > b.max-bytes {
		return false
	}

	b.used += bytes

	return true
}

func (b *catalogSpoolByteBudget) release(bytes int64) {
	b.mu.Lock()
	defer b.mu.Unlock()

	b.used -= bytes
}

func (b *catalogSpoolByteBudget) accountExisting(bytes int64) {
	b.mu.Lock()
	defer b.mu.Unlock()

	if bytes <= 0 || b.used >= b.max {
		return
	}

	if bytes >= b.max-b.used {
		b.used = b.max

		return
	}

	b.used += bytes
}

type budgetedCatalogSpoolWriter struct {
	file     *os.File
	budget   *catalogSpoolByteBudget
	reserved int64
}

func (w *budgetedCatalogSpoolWriter) Write(data []byte) (int, error) {
	bytes := int64(len(data))
	if !w.budget.reserve(bytes) {
		return 0, errCatalogSpoolBudgetExceeded
	}

	written, err := w.file.Write(data)
	w.reserved += int64(written)
	w.budget.release(bytes - int64(written))

	return written, err
}

func cleanupStaleCatalogSpools() {
	initializeCatalogSpoolBudget(os.TempDir(), time.Now(), activeCatalogSpoolBudget)
}

func initializeCatalogSpoolBudget(tempDir string, now time.Time, budget *catalogSpoolByteBudget) {
	paths, err := filepath.Glob(filepath.Join(tempDir, "querylane-catalog-pages-*"))
	if err != nil {
		slog.Warn("failed to list stale catalog page spools")

		return
	}

	cutoff := now.Add(-staleCatalogSpoolAge)

	for _, path := range paths {
		info, err := os.Stat(path)
		if err != nil {
			continue
		}

		if info.ModTime().Before(cutoff) {
			removeErr := os.Remove(path)
			if removeErr == nil || errors.Is(removeErr, os.ErrNotExist) {
				continue
			}

			slog.Warn("failed to remove stale catalog page spool")
		}

		budget.accountExisting(info.Size())
	}
}

// catalogPageSpool keeps a large live-catalog snapshot out of the heap and
// lets storage reconcile it atomically without holding a meta DB transaction
// open across network calls to the user instance.
type catalogPageSpool[Row any] struct {
	path     string
	syncedAt time.Time
	bytes    int64
	budget   *catalogSpoolByteBudget
	mu       sync.Mutex
	removed  bool
}

func (s *catalogPageSpool[Row]) remove() {
	s.mu.Lock()
	defer s.mu.Unlock()

	if s.removed {
		return
	}

	if removeCatalogSpool(s.path, s.bytes, s.budget) {
		s.removed = true
	}
}

func removeCatalogSpool(path string, bytes int64, budget *catalogSpoolByteBudget) bool {
	if err := os.Remove(path); err != nil && !errors.Is(err, os.ErrNotExist) {
		slog.Warn("failed to remove catalog page spool")

		return false
	}

	budget.release(bytes)

	return true
}

func (s *catalogPageSpool[Row]) pages() iter.Seq2[[]Row, error] {
	return func(yield func([]Row, error) bool) {
		file, err := os.Open(s.path)
		if err != nil {
			yield(nil, fmt.Errorf("open catalog page spool: %w", err))

			return
		}

		decoder := gob.NewDecoder(file)

		for {
			var rows []Row

			if err := decoder.Decode(&rows); err != nil {
				if errors.Is(err, io.EOF) {
					if closeErr := file.Close(); closeErr != nil {
						yield(nil, fmt.Errorf("close catalog page spool: %w", closeErr))
					}

					return
				}

				_ = file.Close()

				yield(nil, fmt.Errorf("read catalog page spool: %w", err))

				return
			}

			if !yield(rows, nil) {
				if closeErr := file.Close(); closeErr != nil {
					slog.Warn("failed to close catalog page spool")
				}

				return
			}
		}
	}
}

// spoolCatalogPages fetches and maps one bounded live-catalog page at a time,
// writing each page to a private temporary file before storage opens its short
// reconciliation transaction.
func spoolCatalogPages[Source, Row any](
	ctx context.Context,
	op string,
	fetch func(context.Context, aip.Params) ([]Source, string, error),
	convert func(Source, time.Time) Row,
) (*catalogPageSpool[Row], error) {
	syncedAt := time.Now()

	staleCatalogSpoolCleanup.Do(cleanupStaleCatalogSpools)

	file, err := os.CreateTemp("", "querylane-catalog-pages-*")
	if err != nil {
		return nil, fmt.Errorf("create catalog page spool: %w", err)
	}

	path := file.Name()
	removeOnError := true
	writer := &budgetedCatalogSpoolWriter{file: file, budget: activeCatalogSpoolBudget}

	defer func() {
		if removeOnError {
			removeCatalogSpool(path, writer.reserved, activeCatalogSpoolBudget)
		}
	}()

	encoder := gob.NewEncoder(writer)

	var pageToken string

	for {
		page, nextToken, err := fetch(ctx, aip.Params{PageSize: syncPageSize, PageToken: pageToken})
		if err != nil {
			_ = file.Close()

			return nil, fmt.Errorf("%s: %w", op, err)
		}

		rows := make([]Row, len(page))
		for i, item := range page {
			rows[i] = convert(item, syncedAt)
		}

		if err := encoder.Encode(rows); err != nil {
			_ = file.Close()

			return nil, fmt.Errorf("write catalog page spool: %w", err)
		}

		if nextToken == "" {
			break
		}

		pageToken = nextToken
	}

	if err := file.Close(); err != nil {
		return nil, fmt.Errorf("close catalog page spool: %w", err)
	}

	removeOnError = false

	return &catalogPageSpool[Row]{
		path:     path,
		syncedAt: syncedAt,
		bytes:    writer.reserved,
		budget:   activeCatalogSpoolBudget,
	}, nil
}
