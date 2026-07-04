package storage

import (
	"context"
	"database/sql"
	"fmt"
	"time"

	"github.com/go-jet/jet/v2/postgres"

	modelgen "github.com/querylane/querylane/backend/storage/gen/querylane/public/model"
	"github.com/querylane/querylane/backend/storage/gen/querylane/public/table"
)

// InstanceCacheSample is one observation of an instance's buffer-cache
// counters at a moment in time. Counters are cumulative since the Postgres
// stats reset; charts compute rates over windows from raw counters rather
// than relying on a stored hit-ratio.
type InstanceCacheSample struct {
	InstanceID string
	ObservedAt time.Time
	BlocksHit  int64
	BlocksRead int64
}

type InstanceCacheSampleStore interface {
	InsertTx(ctx context.Context, exec QueryExecutor, sample InstanceCacheSample) error
	ListSamples(ctx context.Context, instanceID string, since time.Time, until time.Time, limit int) ([]InstanceCacheSample, error)
}

type PGInstanceCacheSampleStore struct {
	db *sql.DB
}

// NewInstanceCacheSampleStore returns a store backed by db.
func NewInstanceCacheSampleStore(db *sql.DB) *PGInstanceCacheSampleStore {
	return &PGInstanceCacheSampleStore{db: db}
}

// InsertTx records one cache-metrics sample inside the caller's transaction.
func (s *PGInstanceCacheSampleStore) InsertTx(ctx context.Context, exec QueryExecutor, sample InstanceCacheSample) error {
	row := modelgen.InstanceCacheSample{
		InstanceID: sample.InstanceID,
		ObservedAt: sample.ObservedAt,
		BlocksHit:  sample.BlocksHit,
		BlocksRead: sample.BlocksRead,
	}

	stmt := table.InstanceCacheSample.
		INSERT(table.InstanceCacheSample.AllColumns).
		MODEL(row).
		ON_CONFLICT(table.InstanceCacheSample.InstanceID, table.InstanceCacheSample.ObservedAt).
		DO_NOTHING()

	if _, err := stmt.ExecContext(ctx, exec); err != nil {
		return fmt.Errorf("insert instance cache sample: %w", err)
	}

	return nil
}

// ListSamples returns samples in [since, until) ordered by observed_at ASC.
// limit <= 0 means no cap.
func (s *PGInstanceCacheSampleStore) ListSamples(ctx context.Context, instanceID string, since time.Time, until time.Time, limit int) ([]InstanceCacheSample, error) {
	stmt := postgres.SELECT(table.InstanceCacheSample.AllColumns).
		FROM(table.InstanceCacheSample).
		WHERE(
			table.InstanceCacheSample.InstanceID.EQ(postgres.String(instanceID)).
				AND(observedAtBetween(table.InstanceCacheSample.ObservedAt, since, until)),
		).
		ORDER_BY(table.InstanceCacheSample.ObservedAt.ASC()).
		LIMIT(sampleLimit(limit))

	var rows []modelgen.InstanceCacheSample
	if err := stmt.QueryContext(ctx, s.db, &rows); err != nil {
		return nil, fmt.Errorf("list instance cache samples: %w", err)
	}

	out := make([]InstanceCacheSample, len(rows))
	for i, row := range rows {
		out[i] = InstanceCacheSample{
			InstanceID: row.InstanceID,
			ObservedAt: row.ObservedAt,
			BlocksHit:  row.BlocksHit,
			BlocksRead: row.BlocksRead,
		}
	}

	return out, nil
}
