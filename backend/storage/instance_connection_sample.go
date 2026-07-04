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

// InstanceConnectionSample is one observation of an instance's connection
// utilization at a moment in time.
type InstanceConnectionSample struct {
	InstanceID string
	ObservedAt time.Time
	Active     int64
	Idle       int64
	Total      int64
	MaxConn    int64
}

type InstanceConnectionSampleStore interface {
	InsertTx(ctx context.Context, exec QueryExecutor, sample InstanceConnectionSample) error
	ListSamples(ctx context.Context, instanceID string, since time.Time, until time.Time, limit int) ([]InstanceConnectionSample, error)
}

type PGInstanceConnectionSampleStore struct {
	db *sql.DB
}

// NewInstanceConnectionSampleStore returns a store backed by db.
func NewInstanceConnectionSampleStore(db *sql.DB) *PGInstanceConnectionSampleStore {
	return &PGInstanceConnectionSampleStore{db: db}
}

// InsertTx records one connection-metrics sample inside the caller's transaction.
func (s *PGInstanceConnectionSampleStore) InsertTx(ctx context.Context, exec QueryExecutor, sample InstanceConnectionSample) error {
	row := modelgen.InstanceConnectionSample{
		InstanceID: sample.InstanceID,
		ObservedAt: sample.ObservedAt,
		Active:     sample.Active,
		Idle:       sample.Idle,
		Total:      sample.Total,
		MaxConn:    sample.MaxConn,
	}

	stmt := table.InstanceConnectionSample.
		INSERT(table.InstanceConnectionSample.AllColumns).
		MODEL(row).
		ON_CONFLICT(table.InstanceConnectionSample.InstanceID, table.InstanceConnectionSample.ObservedAt).
		DO_NOTHING()

	if _, err := stmt.ExecContext(ctx, exec); err != nil {
		return fmt.Errorf("insert instance connection sample: %w", err)
	}

	return nil
}

// ListSamples returns samples in [since, until) ordered by observed_at ASC.
// limit <= 0 means no cap.
func (s *PGInstanceConnectionSampleStore) ListSamples(ctx context.Context, instanceID string, since time.Time, until time.Time, limit int) ([]InstanceConnectionSample, error) {
	stmt := postgres.SELECT(table.InstanceConnectionSample.AllColumns).
		FROM(table.InstanceConnectionSample).
		WHERE(
			table.InstanceConnectionSample.InstanceID.EQ(postgres.String(instanceID)).
				AND(observedAtBetween(table.InstanceConnectionSample.ObservedAt, since, until)),
		).
		ORDER_BY(table.InstanceConnectionSample.ObservedAt.ASC()).
		LIMIT(sampleLimit(limit))

	var rows []modelgen.InstanceConnectionSample
	if err := stmt.QueryContext(ctx, s.db, &rows); err != nil {
		return nil, fmt.Errorf("list instance connection samples: %w", err)
	}

	out := make([]InstanceConnectionSample, len(rows))
	for i, row := range rows {
		out[i] = InstanceConnectionSample{
			InstanceID: row.InstanceID,
			ObservedAt: row.ObservedAt,
			Active:     row.Active,
			Idle:       row.Idle,
			Total:      row.Total,
			MaxConn:    row.MaxConn,
		}
	}

	return out, nil
}
