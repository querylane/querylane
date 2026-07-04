package postgres

import (
	"context"
	"database/sql"
	"fmt"
	"log/slog"
	"strings"
	"sync"

	"github.com/querylane/querylane/backend/engine"
)

// GetServerInfo retrieves live server metadata from the PostgreSQL instance.
func (d *Postgres) GetServerInfo(ctx context.Context, db *sql.DB) (*engine.ServerInfo, error) {
	var info engine.ServerInfo

	err := db.QueryRowContext(ctx, getServerInfoQuery).Scan(
		&info.Version,
		&info.VersionNum,
		&info.StartedAt,
		&info.IsInRecovery,
		&info.MaxConnections,
	)
	if err != nil {
		return nil, classifyQueryError("query server info", err)
	}

	return &info, nil
}

// GetInstanceOverview retrieves live health signals from the PostgreSQL instance.
// Each metric category is queried independently and in parallel so that a
// failure in one (e.g., insufficient privileges for pg_database_size) does
// not prevent the others from being returned.
func (d *Postgres) GetInstanceOverview(ctx context.Context, db *sql.DB) (*engine.InstanceOverview, error) {
	overview := &engine.InstanceOverview{}

	var (
		wg           sync.WaitGroup
		partialErrMu sync.Mutex
	)

	recordPartialError := func(metric, logMessage, op string, err error) {
		classified := classifyQueryError(op, err)
		slog.WarnContext(ctx, logMessage, slog.String("error", classified.Error()))

		partialErrMu.Lock()
		defer partialErrMu.Unlock()

		overview.PartialErrors = append(overview.PartialErrors, engine.OverviewMetricError{
			Metric: metric,
			Err:    classified,
		})
	}

	wg.Go(func() {
		var conn engine.ConnectionMetrics
		if err := db.QueryRowContext(ctx, getConnectionMetricsQuery).Scan(
			&conn.Active, &conn.Idle, &conn.Total, &conn.Max,
		); err != nil {
			recordPartialError("connections", "failed to query connection metrics", "query connection metrics", err)
			return
		}

		overview.Connections = &conn
	})

	wg.Go(func() {
		var storage engine.StorageMetrics
		if err := db.QueryRowContext(ctx, getStorageMetricsQuery).Scan(
			&storage.TotalSizeBytes,
		); err != nil {
			recordPartialError("storage", "failed to query storage metrics", "query storage metrics", err)
			return
		}

		overview.Storage = &storage
	})

	wg.Go(func() {
		var cache engine.CacheMetrics
		if err := db.QueryRowContext(ctx, getCacheMetricsQuery).Scan(
			&cache.HitRatio, &cache.BlocksHit, &cache.BlocksRead,
		); err != nil {
			recordPartialError("cache", "failed to query cache metrics", "query cache metrics", err)
			return
		}

		overview.Cache = &cache
	})

	wg.Go(func() {
		var io engine.IOMetrics
		if err := db.QueryRowContext(ctx, getIOMetricsQuery).Scan(
			&io.Reads,
			&io.ReadBytes,
			&io.Writes,
			&io.WriteBytes,
			&io.Extends,
			&io.ExtendBytes,
			&io.Fsyncs,
		); err != nil {
			recordPartialError("io", "failed to query I/O metrics", "query I/O metrics", err)
			return
		}

		overview.IO = &io
	})

	wg.Wait()

	return overview, nil
}

// CheckInstanceHealth retrieves actionable live health checks from inexpensive
// PostgreSQL catalog/statistics views. Each category is queried independently so
// permission gaps return partial errors without hiding the rest of the health
// response.
func (d *Postgres) CheckInstanceHealth(ctx context.Context, db *sql.DB) (*engine.InstanceHealth, error) {
	health := &engine.InstanceHealth{}

	var (
		wg           sync.WaitGroup
		partialErrMu sync.Mutex
	)

	recordPartialError := func(check, logMessage, op string, err error) {
		classified := classifyQueryError(op, err)
		slog.WarnContext(ctx, logMessage, slog.String("error", classified.Error()))

		partialErrMu.Lock()
		defer partialErrMu.Unlock()

		health.PartialErrors = append(health.PartialErrors, engine.OverviewMetricError{
			Metric: check,
			Err:    classified,
		})
	}

	wg.Go(func() {
		activity, err := queryConnectionActivityHealth(ctx, db)
		if err != nil {
			recordPartialError("connection_activity", "failed to query connection activity health", "query connection activity health", err)
			return
		}

		health.ConnectionActivity = activity
	})

	wg.Go(func() {
		replication, err := queryReplicationHealth(ctx, db)
		if err != nil {
			recordPartialError("replication", "failed to query replication health", "query replication health", err)
			return
		}

		health.Replication = replication
	})

	wg.Go(func() {
		statsAccess, err := queryStatsAccessHealth(ctx, db)
		if err != nil {
			recordPartialError("stats_access", "failed to query stats access health", "query stats access health", err)
			return
		}

		health.StatsAccess = statsAccess
	})

	wg.Go(func() {
		pgStatStatements, err := queryPGStatStatementsHealth(ctx, db)
		if err != nil {
			recordPartialError("pg_stat_statements", "failed to query pg_stat_statements health", "query pg_stat_statements health", err)
			return
		}

		health.PGStatStatements = pgStatStatements

		if !pgStatStatements.ExtensionInstalled || pgStatStatements.ViewQueryable {
			return
		}

		partialErrMu.Lock()
		defer partialErrMu.Unlock()

		health.PartialErrors = append(health.PartialErrors, engine.OverviewMetricError{
			Metric: "pg_stat_statements",
			Err:    engine.ErrQueryUnavailable,
		})
	})

	wg.Wait()

	return health, nil
}

func queryConnectionActivityHealth(ctx context.Context, db *sql.DB) (*engine.ConnectionActivityHealth, error) {
	var activity engine.ConnectionActivityHealth
	if err := db.QueryRowContext(ctx, getConnectionActivityHealthQuery).Scan(
		&activity.Active,
		&activity.Idle,
		&activity.IdleInTransaction,
		&activity.Total,
		&activity.Max,
		&activity.UtilizationRatio,
		&activity.WaitingForLocks,
		&activity.LongRunningTxs,
		&activity.LongestTxSeconds,
	); err != nil {
		return nil, classifyQueryError("query connection activity health", err)
	}

	activity.Status, activity.Summary = summarizeConnectionActivity(activity)

	return &activity, nil
}

func queryReplicationHealth(ctx context.Context, db *sql.DB) (*engine.ReplicationHealth, error) {
	var inRecovery bool
	if err := db.QueryRowContext(ctx, getRecoveryStateQuery).Scan(&inRecovery); err != nil {
		return nil, classifyQueryError("query recovery state", err)
	}

	replication := &engine.ReplicationHealth{
		Status: engine.HealthStatusOK,
	}

	if inRecovery {
		replication.Role = engine.ReplicationRoleReplica
		if err := db.QueryRowContext(ctx, getReplicaReplicationHealthQuery).Scan(
			&replication.WALReceiverActive,
			&replication.ReplayLagSeconds,
		); err != nil {
			return nil, classifyQueryError("query replica replication health", err)
		}

		replication.Summary = "replica with active WAL receiver"
		if !replication.WALReceiverActive {
			replication.Status = engine.HealthStatusWarning
			replication.Summary = "replica without active WAL receiver"
		}

		return replication, nil
	}

	replication.Role = engine.ReplicationRolePrimary
	if err := db.QueryRowContext(ctx, getPrimaryReplicationHealthQuery).Scan(
		&replication.AttachedReplicas,
		&replication.StreamingReplicas,
		&replication.SynchronousReplicas,
		&replication.MaxReplicationLagBytes,
	); err != nil {
		return nil, classifyQueryError("query primary replication health", err)
	}

	replication.Summary = fmt.Sprintf("primary with %d attached replicas", replication.AttachedReplicas)
	if replication.AttachedReplicas > 0 && replication.StreamingReplicas == 0 {
		replication.Status = engine.HealthStatusWarning
		replication.Summary = fmt.Sprintf("primary with %d replicas, none streaming", replication.AttachedReplicas)
	}

	return replication, nil
}

func queryStatsAccessHealth(ctx context.Context, db *sql.DB) (*engine.StatsAccessHealth, error) {
	var statsAccess engine.StatsAccessHealth
	if err := db.QueryRowContext(ctx, getStatsAccessHealthQuery).Scan(
		&statsAccess.CurrentUser,
		&statsAccess.Superuser,
		&statsAccess.PGMonitorMember,
		&statsAccess.PGReadAllStatsMember,
		&statsAccess.CanReadPGStatActivity,
		&statsAccess.CanReadPGStatDatabase,
	); err != nil {
		return nil, classifyQueryError("query stats access health", err)
	}

	statsAccess.Status, statsAccess.Summary = summarizeStatsAccess(statsAccess)

	return &statsAccess, nil
}

func queryPGStatStatementsHealth(ctx context.Context, db *sql.DB) (*engine.PGStatStatementsHealth, error) {
	var pgStatStatements engine.PGStatStatementsHealth
	if err := db.QueryRowContext(ctx, getPGStatStatementsConfigQuery).Scan(
		&pgStatStatements.ExtensionInstalled,
		&pgStatStatements.ExtensionSchema,
		&pgStatStatements.ExtensionVersion,
		&pgStatStatements.SharedPreloadConfigured,
		&pgStatStatements.TrackMode,
	); err != nil {
		return nil, classifyQueryError("query pg_stat_statements config", err)
	}

	if !pgStatStatements.ExtensionInstalled {
		pgStatStatements.Status = engine.HealthStatusNotApplicable
		pgStatStatements.Summary = "pg_stat_statements is not installed"

		return &pgStatStatements, nil
	}

	var statsResetAt sql.NullTime

	pgStatStatementsSchema := quoteIdentifier(pgStatStatements.ExtensionSchema)
	statsQuery := fmt.Sprintf(getPGStatStatementsStatsQuery, pgStatStatementsSchema, pgStatStatementsSchema)

	err := db.QueryRowContext(ctx, statsQuery).Scan(
		&pgStatStatements.StatementCount,
		&statsResetAt,
	)
	if err != nil {
		pgStatStatements.Status = engine.HealthStatusWarning

		pgStatStatements.Summary = "pg_stat_statements is installed but not queryable"
		if !pgStatStatements.SharedPreloadConfigured {
			pgStatStatements.Summary = "pg_stat_statements is installed but not in shared_preload_libraries"
		}

		return &pgStatStatements, nil
	}

	pgStatStatements.ViewQueryable = true

	if statsResetAt.Valid {
		resetAt := statsResetAt.Time
		pgStatStatements.StatsResetAt = &resetAt
	}

	pgStatStatements.Status, pgStatStatements.Summary = summarizePGStatStatements(pgStatStatements)

	return &pgStatStatements, nil
}

func summarizeConnectionActivity(activity engine.ConnectionActivityHealth) (engine.HealthStatus, string) {
	var signals []string

	if activity.Max > 0 && activity.UtilizationRatio >= 0.9 {
		signals = append(signals, "connection usage is above 90%")
	} else if activity.Max > 0 && activity.UtilizationRatio >= 0.8 {
		signals = append(signals, "connection usage is above 80%")
	}

	if activity.WaitingForLocks > 0 {
		signals = append(signals, fmt.Sprintf("%d connections are waiting on locks", activity.WaitingForLocks))
	}

	if activity.IdleInTransaction > 0 {
		signals = append(signals, fmt.Sprintf("%d connections are idle in transaction", activity.IdleInTransaction))
	}

	if activity.LongRunningTxs > 0 {
		signals = append(signals, fmt.Sprintf("%d transactions are older than 5 minutes", activity.LongRunningTxs))
	}

	if len(signals) > 0 {
		return engine.HealthStatusWarning, strings.Join(signals, "; ")
	}

	return engine.HealthStatusOK, "connection activity looks normal"
}

func summarizeStatsAccess(statsAccess engine.StatsAccessHealth) (engine.HealthStatus, string) {
	if statsAccess.Superuser || statsAccess.PGMonitorMember || statsAccess.PGReadAllStatsMember {
		return engine.HealthStatusOK, statsAccess.CurrentUser + " can inspect PostgreSQL statistics"
	}

	if statsAccess.CanReadPGStatActivity && statsAccess.CanReadPGStatDatabase {
		return engine.HealthStatusWarning, statsAccess.CurrentUser + " can read stats views but may have limited row visibility"
	}

	return engine.HealthStatusWarning, statsAccess.CurrentUser + " has limited PostgreSQL statistics visibility"
}

func summarizePGStatStatements(pgStatStatements engine.PGStatStatementsHealth) (engine.HealthStatus, string) {
	if !pgStatStatements.SharedPreloadConfigured {
		return engine.HealthStatusWarning, "pg_stat_statements is installed but not in shared_preload_libraries"
	}

	if pgStatStatements.StatementCount == 0 {
		return engine.HealthStatusWarning, "pg_stat_statements is installed but no statements are recorded"
	}

	return engine.HealthStatusOK, fmt.Sprintf("pg_stat_statements is tracking %d statements", pgStatStatements.StatementCount)
}

func quoteIdentifier(identifier string) string {
	return `"` + strings.ReplaceAll(identifier, `"`, `""`) + `"`
}
