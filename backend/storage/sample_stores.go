package storage

import (
	"context"
	"database/sql"
	"fmt"
	"time"

	"github.com/go-jet/jet/v2/postgres"

	"github.com/querylane/querylane/backend/storage/gen/querylane/public/model"
	"github.com/querylane/querylane/backend/storage/gen/querylane/public/table"
)

// The probe sample stores share one persistence shape: append-only rows keyed
// by (dimensions..., observed_at), idempotent inserts, and time-range reads
// ordered by observed_at. The generated jet models double as the sample
// types — a sample row is dumb data, so a hand-written mirror struct would
// only add field copying.
//
// Adding a table for a new probe: migration + jet regen + one store type
// below + a prunedSampleColumns entry in sample_query.go (the retention guard
// test enforces the latter).
//
// Counter semantics: cumulative pg_stat_* counters are stored raw together
// with stats_reset; charts compute rates over windows of rows sharing one
// stats_reset AND clamp negative deltas as discontinuities (dropped tables/
// databases shrink aggregates without a new stats_reset).

// insertSamplesTx appends rows inside the caller's transaction as one
// multi-row INSERT. ON CONFLICT DO NOTHING dedupes a genuine
// double-collection at the same instant.
func insertSamplesTx[M any](ctx context.Context, exec QueryExecutor, tbl postgres.Table, allColumns postgres.ColumnList, conflictKey postgres.ColumnList, rows []M) error {
	if len(rows) == 0 {
		return nil
	}

	stmt := tbl.INSERT(allColumns).
		MODELS(rows).
		ON_CONFLICT(conflictKey...).
		DO_NOTHING()

	if _, err := stmt.ExecContext(ctx, exec); err != nil {
		return fmt.Errorf("insert %s rows: %w", tbl.TableName(), err)
	}

	return nil
}

// listSamples returns rows matching cond in [since, until) ordered by
// observed_at ASC. limit <= 0 means no cap.
func listSamples[M any](ctx context.Context, db *sql.DB, tbl postgres.Table, allColumns postgres.ColumnList, cond postgres.BoolExpression, observedAt postgres.ColumnTimestampz, since time.Time, until time.Time, limit int) ([]M, error) {
	stmt := postgres.SELECT(allColumns).
		FROM(tbl).
		WHERE(cond.AND(observedAtBetween(observedAt, since, until))).
		ORDER_BY(observedAt.ASC())

	if limit > 0 {
		stmt = stmt.LIMIT(int64(limit))
	}

	var rows []M
	if err := stmt.QueryContext(ctx, db, &rows); err != nil {
		return nil, fmt.Errorf("list %s rows: %w", tbl.TableName(), err)
	}

	return rows, nil
}

// PGInstanceConnectionSampleStore persists pg_stat_activity utilization
// samples (gauges).
type PGInstanceConnectionSampleStore struct{ db *sql.DB }

// NewInstanceConnectionSampleStore returns a store backed by db.
func NewInstanceConnectionSampleStore(db *sql.DB) *PGInstanceConnectionSampleStore {
	return &PGInstanceConnectionSampleStore{db: db}
}

// InsertTx records one sample inside the caller's transaction.
func (s *PGInstanceConnectionSampleStore) InsertTx(ctx context.Context, exec QueryExecutor, sample model.InstanceConnectionSample) error {
	t := table.InstanceConnectionSample
	return insertSamplesTx(ctx, exec, t, t.AllColumns, postgres.ColumnList{t.InstanceID, t.ObservedAt}, []model.InstanceConnectionSample{sample})
}

// ListSamples returns samples in [since, until) ordered by observed_at ASC.
func (s *PGInstanceConnectionSampleStore) ListSamples(ctx context.Context, instanceID string, since time.Time, until time.Time, limit int) ([]model.InstanceConnectionSample, error) {
	t := table.InstanceConnectionSample
	return listSamples[model.InstanceConnectionSample](ctx, s.db, t, t.AllColumns, t.InstanceID.EQ(postgres.String(instanceID)), t.ObservedAt, since, until, limit)
}

// PGInstanceStorageSampleStore persists instance-total disk usage samples
// (gauges).
type PGInstanceStorageSampleStore struct{ db *sql.DB }

// NewInstanceStorageSampleStore returns a store backed by db.
func NewInstanceStorageSampleStore(db *sql.DB) *PGInstanceStorageSampleStore {
	return &PGInstanceStorageSampleStore{db: db}
}

// InsertTx records one sample inside the caller's transaction.
func (s *PGInstanceStorageSampleStore) InsertTx(ctx context.Context, exec QueryExecutor, sample model.InstanceStorageSample) error {
	t := table.InstanceStorageSample
	return insertSamplesTx(ctx, exec, t, t.AllColumns, postgres.ColumnList{t.InstanceID, t.ObservedAt}, []model.InstanceStorageSample{sample})
}

// ListSamples returns samples in [since, until) ordered by observed_at ASC.
func (s *PGInstanceStorageSampleStore) ListSamples(ctx context.Context, instanceID string, since time.Time, until time.Time, limit int) ([]model.InstanceStorageSample, error) {
	t := table.InstanceStorageSample
	return listSamples[model.InstanceStorageSample](ctx, s.db, t, t.AllColumns, t.InstanceID.EQ(postgres.String(instanceID)), t.ObservedAt, since, until, limit)
}

// PGInstanceCacheSampleStore persists cumulative buffer-cache counters (see
// the counter-semantics note above).
type PGInstanceCacheSampleStore struct{ db *sql.DB }

// NewInstanceCacheSampleStore returns a store backed by db.
func NewInstanceCacheSampleStore(db *sql.DB) *PGInstanceCacheSampleStore {
	return &PGInstanceCacheSampleStore{db: db}
}

// InsertTx records one sample inside the caller's transaction.
func (s *PGInstanceCacheSampleStore) InsertTx(ctx context.Context, exec QueryExecutor, sample model.InstanceCacheSample) error {
	t := table.InstanceCacheSample
	return insertSamplesTx(ctx, exec, t, t.AllColumns, postgres.ColumnList{t.InstanceID, t.ObservedAt}, []model.InstanceCacheSample{sample})
}

// ListSamples returns samples in [since, until) ordered by observed_at ASC.
func (s *PGInstanceCacheSampleStore) ListSamples(ctx context.Context, instanceID string, since time.Time, until time.Time, limit int) ([]model.InstanceCacheSample, error) {
	t := table.InstanceCacheSample
	return listSamples[model.InstanceCacheSample](ctx, s.db, t, t.AllColumns, t.InstanceID.EQ(postgres.String(instanceID)), t.ObservedAt, since, until, limit)
}

// PGInstanceIOSampleStore persists cumulative pg_stat_io totals (PostgreSQL
// 16+; see the counter-semantics note above).
type PGInstanceIOSampleStore struct{ db *sql.DB }

// NewInstanceIOSampleStore returns a store backed by db.
func NewInstanceIOSampleStore(db *sql.DB) *PGInstanceIOSampleStore {
	return &PGInstanceIOSampleStore{db: db}
}

// InsertTx records one sample inside the caller's transaction.
func (s *PGInstanceIOSampleStore) InsertTx(ctx context.Context, exec QueryExecutor, sample model.InstanceIoSample) error {
	t := table.InstanceIoSample
	return insertSamplesTx(ctx, exec, t, t.AllColumns, postgres.ColumnList{t.InstanceID, t.ObservedAt}, []model.InstanceIoSample{sample})
}

// ListSamples returns samples in [since, until) ordered by observed_at ASC.
func (s *PGInstanceIOSampleStore) ListSamples(ctx context.Context, instanceID string, since time.Time, until time.Time, limit int) ([]model.InstanceIoSample, error) {
	t := table.InstanceIoSample
	return listSamples[model.InstanceIoSample](ctx, s.db, t, t.AllColumns, t.InstanceID.EQ(postgres.String(instanceID)), t.ObservedAt, since, until, limit)
}

// PGDatabaseSizeSampleStore persists per-database on-disk sizes (gauges).
type PGDatabaseSizeSampleStore struct{ db *sql.DB }

// NewDatabaseSizeSampleStore returns a store backed by db.
func NewDatabaseSizeSampleStore(db *sql.DB) *PGDatabaseSizeSampleStore {
	return &PGDatabaseSizeSampleStore{db: db}
}

// InsertManyTx records one cycle's per-database samples inside the caller's
// transaction.
func (s *PGDatabaseSizeSampleStore) InsertManyTx(ctx context.Context, exec QueryExecutor, samples []model.DatabaseSizeSample) error {
	t := table.DatabaseSizeSample
	return insertSamplesTx(ctx, exec, t, t.AllColumns, postgres.ColumnList{t.InstanceID, t.DatabaseName, t.ObservedAt}, samples)
}

// ListSamples returns one database's samples in [since, until) ordered by
// observed_at ASC.
func (s *PGDatabaseSizeSampleStore) ListSamples(ctx context.Context, instanceID string, databaseName string, since time.Time, until time.Time, limit int) ([]model.DatabaseSizeSample, error) {
	t := table.DatabaseSizeSample
	cond := t.InstanceID.EQ(postgres.String(instanceID)).AND(t.DatabaseName.EQ(postgres.String(databaseName)))

	return listSamples[model.DatabaseSizeSample](ctx, s.db, t, t.AllColumns, cond, t.ObservedAt, since, until, limit)
}

// PGDatabaseVacuumSampleStore persists per-database vacuum activity (tuple
// counts are gauges; vacuum counts are cumulative — see the counter-semantics
// note above).
type PGDatabaseVacuumSampleStore struct{ db *sql.DB }

// NewDatabaseVacuumSampleStore returns a store backed by db.
func NewDatabaseVacuumSampleStore(db *sql.DB) *PGDatabaseVacuumSampleStore {
	return &PGDatabaseVacuumSampleStore{db: db}
}

// InsertTx records one sample inside the caller's transaction.
func (s *PGDatabaseVacuumSampleStore) InsertTx(ctx context.Context, exec QueryExecutor, sample model.DatabaseVacuumSample) error {
	t := table.DatabaseVacuumSample
	return insertSamplesTx(ctx, exec, t, t.AllColumns, postgres.ColumnList{t.InstanceID, t.DatabaseName, t.ObservedAt}, []model.DatabaseVacuumSample{sample})
}

// ListSamples returns one database's samples in [since, until) ordered by
// observed_at ASC.
func (s *PGDatabaseVacuumSampleStore) ListSamples(ctx context.Context, instanceID string, databaseName string, since time.Time, until time.Time, limit int) ([]model.DatabaseVacuumSample, error) {
	t := table.DatabaseVacuumSample
	cond := t.InstanceID.EQ(postgres.String(instanceID)).AND(t.DatabaseName.EQ(postgres.String(databaseName)))

	return listSamples[model.DatabaseVacuumSample](ctx, s.db, t, t.AllColumns, cond, t.ObservedAt, since, until, limit)
}
