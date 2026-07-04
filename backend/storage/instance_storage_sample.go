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

// InstanceStorageSample is one observation of an instance's total storage
// usage at a moment in time.
type InstanceStorageSample struct {
	InstanceID     string
	ObservedAt     time.Time
	TotalSizeBytes int64
}

type InstanceStorageSampleStore interface {
	InsertTx(ctx context.Context, exec QueryExecutor, sample InstanceStorageSample) error
	ListSamples(ctx context.Context, instanceID string, since time.Time, until time.Time, limit int) ([]InstanceStorageSample, error)
}

type PGInstanceStorageSampleStore struct {
	db *sql.DB
}

// NewInstanceStorageSampleStore returns a store backed by db.
func NewInstanceStorageSampleStore(db *sql.DB) *PGInstanceStorageSampleStore {
	return &PGInstanceStorageSampleStore{db: db}
}

// InsertTx records one storage-metrics sample inside the caller's transaction.
func (s *PGInstanceStorageSampleStore) InsertTx(ctx context.Context, exec QueryExecutor, sample InstanceStorageSample) error {
	row := modelgen.InstanceStorageSample{
		InstanceID:     sample.InstanceID,
		ObservedAt:     sample.ObservedAt,
		TotalSizeBytes: sample.TotalSizeBytes,
	}

	stmt := table.InstanceStorageSample.
		INSERT(table.InstanceStorageSample.AllColumns).
		MODEL(row).
		ON_CONFLICT(table.InstanceStorageSample.InstanceID, table.InstanceStorageSample.ObservedAt).
		DO_NOTHING()

	if _, err := stmt.ExecContext(ctx, exec); err != nil {
		return fmt.Errorf("insert instance storage sample: %w", err)
	}

	return nil
}

// ListSamples returns samples in [since, until) ordered by observed_at ASC.
// limit <= 0 means no cap.
func (s *PGInstanceStorageSampleStore) ListSamples(ctx context.Context, instanceID string, since time.Time, until time.Time, limit int) ([]InstanceStorageSample, error) {
	stmt := postgres.SELECT(table.InstanceStorageSample.AllColumns).
		FROM(table.InstanceStorageSample).
		WHERE(
			table.InstanceStorageSample.InstanceID.EQ(postgres.String(instanceID)).
				AND(observedAtBetween(table.InstanceStorageSample.ObservedAt, since, until)),
		).
		ORDER_BY(table.InstanceStorageSample.ObservedAt.ASC()).
		LIMIT(sampleLimit(limit))

	var rows []modelgen.InstanceStorageSample
	if err := stmt.QueryContext(ctx, s.db, &rows); err != nil {
		return nil, fmt.Errorf("list instance storage samples: %w", err)
	}

	out := make([]InstanceStorageSample, len(rows))
	for i, row := range rows {
		out[i] = InstanceStorageSample{
			InstanceID:     row.InstanceID,
			ObservedAt:     row.ObservedAt,
			TotalSizeBytes: row.TotalSizeBytes,
		}
	}

	return out, nil
}
