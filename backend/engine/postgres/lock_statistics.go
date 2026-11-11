package postgres

import (
	"context"
	"database/sql"
	_ "embed"
	"errors"
	"fmt"
	"math"

	"github.com/querylane/querylane/backend/engine"
	"github.com/querylane/querylane/backend/postgreserrors"
)

//go:embed queries/get_lock_statistics.sql
var getLockStatisticsQuery string

const maxLockStatisticTypes = 64

// Check the actual catalog contract as well as the major version: forks and
// preview servers need not ship the same view. Column privileges include grants
// inherited from other roles, without assuming pg_read_all_stats is required.
const discoverLockStatisticsQuery = `
WITH expected(attname, atttypid) AS (
    VALUES ('locktype', 'pg_catalog.text'::regtype),
           ('waits', 'pg_catalog.int8'::regtype),
           ('wait_time', 'pg_catalog.float8'::regtype),
           ('fastpath_exceeded', 'pg_catalog.int8'::regtype),
           ('stats_reset', 'pg_catalog.timestamptz'::regtype)
), actual AS (
    SELECT a.attrelid, a.attnum
    FROM pg_catalog.pg_attribute AS a
    JOIN expected AS e ON a.attname = e.attname AND a.atttypid = e.atttypid
    JOIN pg_catalog.pg_class AS c ON c.oid = a.attrelid AND c.relkind = 'v'
    WHERE a.attrelid = pg_catalog.to_regclass('pg_catalog.pg_stat_lock')
      AND a.attnum > 0 AND NOT a.attisdropped
)
SELECT current_setting('server_version_num')::int >= 190000,
       count(*) = 5,
       coalesce(bool_and(pg_catalog.has_column_privilege(attrelid, attnum, 'SELECT')), false)
FROM actual`

func queryLockStatisticsHealth(ctx context.Context, db *sql.DB) (*engine.LockStatistics, error) {
	ctx, cancel := context.WithTimeout(ctx, probeStatementTimeout)
	defer cancel()

	statistics := &engine.LockStatistics{
		Availability: engine.LockStatisticsUnavailable,
		Status:       engine.HealthStatusUnknown,
		Summary:      "Lock statistics could not be observed",
	}
	err := withProbeTx(ctx, db, probeStatementTimeout, func(tx *sql.Tx) error {
		var supportedVersion, supportedShape, canRead bool
		if err := tx.QueryRowContext(ctx, discoverLockStatisticsQuery).Scan(&supportedVersion, &supportedShape, &canRead); err != nil {
			return err
		}
		if !supportedVersion || !supportedShape {
			statistics.Availability = engine.LockStatisticsUnsupported
			statistics.Status = engine.HealthStatusNotApplicable
			statistics.Summary = "Lock statistics require the PostgreSQL 19 pg_stat_lock view"
			return nil
		}
		if !canRead {
			setLockStatisticsRestricted(statistics)
			return nil
		}

		rows, err := tx.QueryContext(ctx, getLockStatisticsQuery)
		if err != nil {
			return err
		}
		defer rows.Close()

		if err := scanLockStatistics(rows, statistics); err != nil {
			return err
		}
		return rows.Err()
	})
	if err != nil {
		classified := classifyQueryError("query lock statistics", err)
		statistics.ByType = nil
		if errors.Is(classified, engine.ErrQueryPermissionDenied) || postgreserrors.IsKind(classified, postgreserrors.KindPermissionDenied) {
			setLockStatisticsRestricted(statistics)
			return statistics, nil
		}
		statistics.Availability = engine.LockStatisticsUnavailable
		statistics.Status = engine.HealthStatusUnknown
		statistics.Summary = "Lock statistics could not be observed"
		return statistics, classified
	}
	return statistics, nil
}

func setLockStatisticsRestricted(statistics *engine.LockStatistics) {
	statistics.Availability = engine.LockStatisticsRestricted
	statistics.Status = engine.HealthStatusUnknown
	statistics.Summary = "The connected role cannot read complete lock statistics"
	statistics.ByType = nil
}

func scanLockStatistics(rows *sql.Rows, statistics *engine.LockStatistics) error {
	var totalWaits int64
	for rows.Next() {
		var (
			lockType         sql.NullString
			waits            sql.NullInt64
			waitTime         sql.NullFloat64
			fastpathExceeded sql.NullInt64
			statsReset       sql.NullTime
		)
		if err := rows.Scan(&lockType, &waits, &waitTime, &fastpathExceeded, &statsReset); err != nil {
			return err
		}
		// Some providers mask protected values with NULL rather than rejecting
		// SELECT. Never coalesce that to a fabricated all-zero sample.
		if !lockType.Valid || !waits.Valid || !waitTime.Valid || !fastpathExceeded.Valid {
			setLockStatisticsRestricted(statistics)
			return nil
		}
		if len(statistics.ByType) >= maxLockStatisticTypes || lockType.String == "" || waits.Int64 < 0 || fastpathExceeded.Int64 < 0 || waitTime.Float64 < 0 || math.IsNaN(waitTime.Float64) || math.IsInf(waitTime.Float64, 0) {
			return fmt.Errorf("invalid lock statistics sample: %w", engine.ErrQueryUnavailable)
		}
		row := engine.LockTypeStatistics{
			LockType:         lockType.String,
			Waits:            waits.Int64,
			WaitTimeMs:       waitTime.Float64,
			FastpathExceeded: fastpathExceeded.Int64,
		}
		if statsReset.Valid {
			row.StatsResetAt = &statsReset.Time
		}
		statistics.ByType = append(statistics.ByType, row)
		totalWaits += waits.Int64
	}
	if err := rows.Err(); err != nil {
		return err
	}
	if len(statistics.ByType) == 0 {
		return fmt.Errorf("lock statistics returned no lock types: %w", engine.ErrQueryUnavailable)
	}
	statistics.Availability = engine.LockStatisticsAvailable
	statistics.Status = engine.HealthStatusOK
	statistics.Summary = fmt.Sprintf("%d completed lock waits exceeding deadlock_timeout; cumulative since statistics reset", totalWaits)
	return nil
}
