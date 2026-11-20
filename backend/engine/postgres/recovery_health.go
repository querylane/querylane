package postgres

import (
	"context"
	"database/sql"
	_ "embed"
	"errors"
	"fmt"

	"github.com/querylane/querylane/backend/engine"
	"github.com/querylane/querylane/backend/postgreserrors"
)

//go:embed queries/get_recovery_health.sql
var getRecoveryHealthQuery string

// Check the actual native-view contract as well as the major version: preview
// releases and PostgreSQL-compatible providers need not expose the same shape.
// Effective column SELECT privileges can differ from pg_read_all_stats access.
const discoverRecoveryHealthQuery = `
WITH expected(attname, atttypid) AS (
    VALUES ('pause_state', 'pg_catalog.text'::regtype),
           ('promote_triggered', 'pg_catalog.bool'::regtype),
           ('replay_end_lsn', 'pg_catalog.pg_lsn'::regtype),
           ('replay_end_tli', 'pg_catalog.int4'::regtype)
), actual AS (
    SELECT a.attrelid, a.attnum
    FROM pg_catalog.pg_attribute AS a
    JOIN expected AS e ON a.attname = e.attname AND a.atttypid = e.atttypid
    JOIN pg_catalog.pg_class AS c ON c.oid = a.attrelid AND c.relkind = 'v'
    WHERE a.attrelid = pg_catalog.to_regclass('pg_catalog.pg_stat_recovery')
      AND a.attnum > 0 AND NOT a.attisdropped
)
SELECT current_setting('server_version_num')::int >= 190000,
       count(*) = 4,
       coalesce(bool_and(pg_catalog.has_column_privilege(attrelid, attnum, 'SELECT')), false)
FROM actual`

func queryRecoveryHealth(ctx context.Context, db *sql.DB, inRecovery, statisticsVisible bool) (*engine.RecoveryHealth, error) {
	recovery := &engine.RecoveryHealth{Availability: engine.RecoveryUnavailable}
	err := withProbeTx(ctx, db, probeStatementTimeout, func(tx *sql.Tx) error {
		var supportedVersion, supportedShape, canRead bool
		if err := tx.QueryRowContext(ctx, discoverRecoveryHealthQuery).Scan(&supportedVersion, &supportedShape, &canRead); err != nil {
			return err
		}
		if !supportedVersion || !supportedShape {
			recovery.Availability = engine.RecoveryUnsupported
			return nil
		}
		if !inRecovery {
			recovery.Availability = engine.RecoveryNotApplicable
			return nil
		}
		if !statisticsVisible || !canRead {
			recovery.Availability = engine.RecoveryRestricted
			return nil
		}

		var pauseState, replayEndLSN sql.NullString
		var promotionTriggered sql.NullBool
		var replayTimeline sql.NullInt32
		err := tx.QueryRowContext(ctx, getRecoveryHealthQuery).Scan(&pauseState, &promotionTriggered, &replayEndLSN, &replayTimeline)
		if err != nil {
			// PostgreSQL deliberately returns no rows to restricted roles, and
			// after promotion. Neither absence nor a masked sample proves that
			// replay is healthy. A subsequent health check observes the new role.
			if errors.Is(err, sql.ErrNoRows) {
				return fmt.Errorf("no visible recovery state: %w", engine.ErrQueryUnavailable)
			}
			return err
		}
		if !pauseState.Valid || !promotionTriggered.Valid || !replayEndLSN.Valid || !replayTimeline.Valid {
			return fmt.Errorf("incomplete recovery state: %w", engine.ErrQueryUnavailable)
		}
		switch pauseState.String {
		case "not paused", "pause requested", "paused":
		default:
			return fmt.Errorf("unrecognized recovery pause state: %w", engine.ErrQueryUnavailable)
		}
		recovery.Availability = engine.RecoveryAvailable
		recovery.PauseState = pauseState.String
		recovery.PromotionTriggered = promotionTriggered.Bool
		recovery.ReplayEndLSN = replayEndLSN.String
		recovery.ReplayTimeline = replayTimeline.Int32
		return nil
	})
	if err != nil {
		// A failed transaction (including commit/cancellation after scanning)
		// must not leave an apparently available sample behind.
		*recovery = engine.RecoveryHealth{Availability: engine.RecoveryUnavailable}
		classified := classifyQueryError("query recovery statistics", err)
		if postgreserrors.IsKind(classified, postgreserrors.KindPermissionDenied) {
			recovery.Availability = engine.RecoveryRestricted
		}
		return recovery, classified
	}
	return recovery, nil
}

func finishReplicationHealth(ctx context.Context, db *sql.DB, replication *engine.ReplicationHealth, inRecovery bool) (*engine.ReplicationHealth, error) {
	recovery, err := queryRecoveryHealth(ctx, db, inRecovery, replication.StatisticsVisible)
	replication.Recovery = recovery
	switch recovery.Availability {
	case engine.RecoveryUnavailable:
		replication.Status = engine.HealthStatusWarning
		replication.Summary += "; recovery statistics unavailable"
	case engine.RecoveryRestricted:
		replication.Status = engine.HealthStatusWarning
		if replication.StatisticsVisible {
			replication.Summary += "; recovery statistics access is restricted"
		}
	case engine.RecoveryAvailable:
		if recovery.PauseState != "not paused" {
			replication.Status = engine.HealthStatusWarning
			replication.Summary += "; WAL replay is " + recovery.PauseState
		}
		if recovery.PromotionTriggered {
			replication.Status = engine.HealthStatusWarning
			replication.Summary += "; promotion triggered"
		}
	case engine.RecoveryUnsupported, engine.RecoveryNotApplicable:
		// Missing capabilities and primary roles do not imply unhealthy replay.
	}
	return replication, err
}
