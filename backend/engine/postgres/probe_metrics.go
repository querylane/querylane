package postgres

import (
	"context"
	"database/sql"
	"fmt"
	"time"

	"github.com/querylane/querylane/backend/engine"
)

// Probe queries run against pools shared with interactive traffic, so each
// one is boxed into a read-only transaction with SET LOCAL timeouts: a slow
// or lock-blocked catalog query fails the probe instead of occupying shared
// pool capacity, and the settings never leak back into the pooled connection.
const (
	// probeStatementTimeout bounds ordinary catalog/statistics lookups.
	probeStatementTimeout = 5 * time.Second

	// probeSizeStatementTimeout bounds pg_database_size, which walks data
	// directories and can legitimately take seconds on large clusters.
	probeSizeStatementTimeout = 30 * time.Second

	// probeVacuumStatementTimeout bounds pg_stat_user_tables aggregation,
	// which scales with the number of user tables in the database.
	probeVacuumStatementTimeout = 15 * time.Second

	probeLockTimeout     = time.Second
	probeApplicationName = "querylane-probe"
)

// withProbeTx runs fn inside a read-only transaction hardened with the probe
// timeouts. set_config(..., true) is the parameterized equivalent of SET
// LOCAL, so every setting dies with the transaction.
func withProbeTx(ctx context.Context, db *sql.DB, statementTimeout time.Duration, fn func(tx *sql.Tx) error) error {
	tx, err := db.BeginTx(ctx, &sql.TxOptions{ReadOnly: true})
	if err != nil {
		return fmt.Errorf("begin probe transaction: %w", err)
	}

	defer func() { _ = tx.Rollback() }()

	_, err = tx.ExecContext(ctx,
		`SELECT set_config('statement_timeout', $1, true),
		        set_config('lock_timeout', $2, true),
		        set_config('application_name', $3, true)`,
		fmt.Sprintf("%dms", statementTimeout.Milliseconds()),
		fmt.Sprintf("%dms", probeLockTimeout.Milliseconds()),
		probeApplicationName,
	)
	if err != nil {
		return fmt.Errorf("configure probe transaction: %w", err)
	}

	if err := fn(tx); err != nil {
		return err
	}

	if err := tx.Commit(); err != nil {
		return fmt.Errorf("commit probe transaction: %w", err)
	}

	return nil
}

// GetServerVersionNum reads server_version_num under probe-hardened settings
// so version gates never occupy shared pool capacity on a wedged server.
func (d *Postgres) GetServerVersionNum(ctx context.Context, db *sql.DB) (int32, error) {
	var version int32

	err := withProbeTx(ctx, db, probeStatementTimeout, func(tx *sql.Tx) error {
		return tx.QueryRowContext(ctx, "SELECT current_setting('server_version_num')::int").Scan(&version)
	})
	if err != nil {
		return 0, classifyQueryError("query server version", err)
	}

	return version, nil
}

// GetConnectionMetrics samples pg_stat_activity connection utilization under
// probe-hardened settings. Same shape as the overview's connection metric.
func (d *Postgres) GetConnectionMetrics(ctx context.Context, db *sql.DB) (*engine.ConnectionMetrics, error) {
	var conn engine.ConnectionMetrics

	err := withProbeTx(ctx, db, probeStatementTimeout, func(tx *sql.Tx) error {
		return tx.QueryRowContext(ctx, getConnectionMetricsQuery).Scan(
			&conn.Active, &conn.Idle, &conn.Total, &conn.Max,
		)
	})
	if err != nil {
		return nil, classifyQueryError("query connection metrics", err)
	}

	return &conn, nil
}

// GetCacheCounters samples cumulative buffer-cache counters plus the newest
// stats_reset across pg_stat_database. database/sql scans a NULL stats_reset
// into the nil *time.Time directly.
func (d *Postgres) GetCacheCounters(ctx context.Context, db *sql.DB) (*engine.CacheCounters, error) {
	var cache engine.CacheCounters

	err := withProbeTx(ctx, db, probeStatementTimeout, func(tx *sql.Tx) error {
		return tx.QueryRowContext(ctx, getCacheCountersQuery).Scan(
			&cache.BlocksHit, &cache.BlocksRead,
			&cache.XactCommit, &cache.XactRollback,
			&cache.TupReturned, &cache.TupFetched,
			&cache.TupInserted, &cache.TupUpdated, &cache.TupDeleted,
			&cache.Conflicts, &cache.Deadlocks,
			&cache.TempFiles, &cache.TempBytes,
			&cache.Sessions, &cache.SessionsAbandoned,
			&cache.SessionsFatal, &cache.SessionsKilled,
			&cache.StatsReset,
		)
	})
	if err != nil {
		return nil, classifyQueryError("query cache counters", err)
	}

	return &cache, nil
}

// ListDatabaseSizes returns the on-disk size of every non-template database.
func (d *Postgres) ListDatabaseSizes(ctx context.Context, db *sql.DB) ([]engine.DatabaseSize, error) {
	var sizes []engine.DatabaseSize

	err := withProbeTx(ctx, db, probeSizeStatementTimeout, func(tx *sql.Tx) error {
		rows, err := tx.QueryContext(ctx, listDatabaseSizesQuery)
		if err != nil {
			return err
		}
		defer rows.Close()

		for rows.Next() {
			var size engine.DatabaseSize
			if err := rows.Scan(&size.DatabaseName, &size.SizeBytes); err != nil {
				return err
			}

			sizes = append(sizes, size)
		}

		return rows.Err()
	})
	if err != nil {
		return nil, classifyQueryError("query database sizes", err)
	}

	return sizes, nil
}

// GetIOCounters samples cumulative pg_stat_io totals (PostgreSQL 16+). On
// older servers the query fails because pg_stat_io does not exist; callers
// gate on server version to avoid probing at all.
func (d *Postgres) GetIOCounters(ctx context.Context, db *sql.DB) (*engine.IOCounters, error) {
	var io engine.IOCounters

	err := withProbeTx(ctx, db, probeStatementTimeout, func(tx *sql.Tx) error {
		return tx.QueryRowContext(ctx, getIOMetricsQuery).Scan(
			&io.Reads, &io.ReadBytes,
			&io.Writes, &io.WriteBytes,
			&io.Extends, &io.ExtendBytes,
			&io.Fsyncs, &io.StatsReset,
		)
	})
	if err != nil {
		return nil, classifyQueryError("query io counters", err)
	}

	return &io, nil
}

// GetVacuumCounters aggregates vacuum activity across the connected
// database's user tables, tagged with that database's stats_reset.
func (d *Postgres) GetVacuumCounters(ctx context.Context, db *sql.DB) (*engine.VacuumCounters, error) {
	var vacuum engine.VacuumCounters

	err := withProbeTx(ctx, db, probeVacuumStatementTimeout, func(tx *sql.Tx) error {
		return tx.QueryRowContext(ctx, getVacuumCountersQuery).Scan(
			&vacuum.LiveTuples, &vacuum.DeadTuples,
			&vacuum.VacuumCount, &vacuum.AutovacuumCount,
			&vacuum.StatsReset,
		)
	})
	if err != nil {
		return nil, classifyQueryError("query vacuum counters", err)
	}

	return &vacuum, nil
}
