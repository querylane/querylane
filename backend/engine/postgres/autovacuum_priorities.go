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

//go:embed queries/get_autovacuum_priorities.sql
var getAutovacuumPrioritiesQuery string

const discoverAutovacuumPrioritiesQuery = `
WITH expected(attname, atttypid) AS (
    VALUES ('relid', 'pg_catalog.oid'::regtype),
           ('schemaname', 'pg_catalog.name'::regtype),
           ('relname', 'pg_catalog.name'::regtype),
           ('score', 'pg_catalog.float8'::regtype),
           ('xid_score', 'pg_catalog.float8'::regtype),
           ('mxid_score', 'pg_catalog.float8'::regtype),
           ('vacuum_score', 'pg_catalog.float8'::regtype),
           ('vacuum_insert_score', 'pg_catalog.float8'::regtype),
           ('analyze_score', 'pg_catalog.float8'::regtype),
           ('do_vacuum', 'pg_catalog.bool'::regtype),
           ('do_analyze', 'pg_catalog.bool'::regtype),
           ('for_wraparound', 'pg_catalog.bool'::regtype)
), actual AS (
    SELECT a.attrelid, a.attnum
    FROM pg_catalog.pg_attribute AS a
    JOIN expected AS e ON a.attname = e.attname AND a.atttypid = e.atttypid
    JOIN pg_catalog.pg_class AS c ON c.oid = a.attrelid AND c.relkind = 'v'
    WHERE a.attrelid = pg_catalog.to_regclass('pg_catalog.pg_stat_autovacuum_scores')
      AND a.attnum > 0 AND NOT a.attisdropped
)
SELECT current_setting('server_version_num')::int >= 190000,
       count(*) = 12,
       coalesce(bool_and(pg_catalog.has_column_privilege(attrelid, attnum, 'SELECT')), false)
FROM actual`

func queryAutovacuumPriorities(ctx context.Context, db *sql.DB) (*engine.AutovacuumPriorities, error) {
	ctx, cancel := context.WithTimeout(ctx, probeStatementTimeout)
	defer cancel()
	priorities := &engine.AutovacuumPriorities{
		Availability: engine.AutovacuumPrioritiesUnavailable,
		Summary:      "Autovacuum priorities could not be observed",
	}
	err := withProbeTx(ctx, db, probeStatementTimeout, func(tx *sql.Tx) error {
		var supportedVersion, supportedShape, canRead bool
		if err := tx.QueryRowContext(ctx, discoverAutovacuumPrioritiesQuery).Scan(&supportedVersion, &supportedShape, &canRead); err != nil {
			return err
		}
		if !supportedVersion || !supportedShape {
			priorities.Availability = engine.AutovacuumPrioritiesUnsupported
			priorities.Summary = "Autovacuum priorities require the PostgreSQL 19 pg_stat_autovacuum_scores view"
			return nil
		}
		if !canRead {
			setAutovacuumPrioritiesRestricted(priorities)
			return nil
		}
		rows, err := tx.QueryContext(ctx, getAutovacuumPrioritiesQuery)
		if err != nil {
			return err
		}
		defer rows.Close()
		return scanAutovacuumPriorities(rows, priorities)
	})
	if err != nil {
		classified := classifyQueryError("query autovacuum priorities", err)
		priorities.Tables = nil
		if errors.Is(classified, engine.ErrQueryPermissionDenied) || postgreserrors.IsKind(classified, postgreserrors.KindPermissionDenied) {
			setAutovacuumPrioritiesRestricted(priorities)
			return priorities, nil
		}
		priorities.Availability = engine.AutovacuumPrioritiesUnavailable
		priorities.Summary = "Autovacuum priorities could not be observed"
		return priorities, classified
	}
	return priorities, nil
}

func setAutovacuumPrioritiesRestricted(priorities *engine.AutovacuumPriorities) {
	priorities.Availability = engine.AutovacuumPrioritiesRestricted
	priorities.Summary = "The connected role cannot read autovacuum priorities"
	priorities.Tables = nil
}

func scanAutovacuumPriorities(rows *sql.Rows, priorities *engine.AutovacuumPriorities) error {
	for rows.Next() {
		var (
			schemaName, tableName                  sql.NullString
			score, xidScore, mxidScore             sql.NullFloat64
			vacuumScore, insertScore, analyzeScore sql.NullFloat64
			doVacuum, doAnalyze, forWraparound     sql.NullBool
		)
		if err := rows.Scan(&schemaName, &tableName, &score, &xidScore, &mxidScore, &vacuumScore, &insertScore, &analyzeScore, &doVacuum, &doAnalyze, &forWraparound); err != nil {
			return err
		}
		valid := schemaName.Valid && schemaName.String != "" && tableName.Valid && tableName.String != "" && doVacuum.Valid && doAnalyze.Valid && forWraparound.Valid
		for _, component := range []sql.NullFloat64{score, xidScore, mxidScore, vacuumScore, insertScore, analyzeScore} {
			valid = valid && component.Valid && !math.IsNaN(component.Float64) && !math.IsInf(component.Float64, 0)
		}
		if !valid {
			// Masked/invalid values are not a real zero score and must not be
			// serialized as non-finite protobuf JSON numbers.
			priorities.Tables = nil
			priorities.Availability = engine.AutovacuumPrioritiesUnavailable
			priorities.Summary = "Autovacuum priorities were not reported with complete finite values"
			return nil
		}
		priorities.Tables = append(priorities.Tables, engine.AutovacuumTablePriority{
			SchemaName: schemaName.String, TableName: tableName.String,
			Score: score.Float64, XIDScore: xidScore.Float64, MXIDScore: mxidScore.Float64,
			VacuumScore: vacuumScore.Float64, VacuumInsertScore: insertScore.Float64, AnalyzeScore: analyzeScore.Float64,
			DoVacuum: doVacuum.Bool, DoAnalyze: doAnalyze.Bool, ForWraparound: forWraparound.Bool,
		})
	}
	if err := rows.Err(); err != nil {
		return err
	}
	priorities.Availability = engine.AutovacuumPrioritiesAvailable
	priorities.Summary = fmt.Sprintf("Current autovacuum scores for %d visible tables in this database; not an exact processing queue", len(priorities.Tables))
	return nil
}
