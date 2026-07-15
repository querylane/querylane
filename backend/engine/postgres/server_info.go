package postgres

import (
	"context"
	"database/sql"
	"fmt"
	"log/slog"
	"strings"
	"sync"
	"time"

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
		var (
			io engine.IOMetrics
			// statsReset is carried by the shared query for the IO probe; the
			// overview has no use for it.
			statsReset *time.Time
		)
		if err := db.QueryRowContext(ctx, getIOMetricsQuery).Scan(
			&io.Reads,
			&io.ReadBytes,
			&io.Writes,
			&io.WriteBytes,
			&io.Extends,
			&io.ExtendBytes,
			&io.Fsyncs,
			&statsReset,
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

	wg.Go(func() {
		autovacuum, err := queryAutovacuumHealth(ctx, db)
		if err != nil {
			recordPartialError("autovacuum", "failed to query autovacuum health", "query autovacuum health", err)
			return
		}

		health.Autovacuum = autovacuum
	})

	wg.Wait()

	return health, nil
}

// CheckInstanceActivity retrieves only pg_stat_activity-backed signals for
// high-frequency polling on the Activity page.
func (d *Postgres) CheckInstanceActivity(ctx context.Context, db *sql.DB) (*engine.InstanceHealth, error) {
	health := &engine.InstanceHealth{}

	activity, err := queryConnectionActivityHealth(ctx, db)
	if err != nil {
		classified := classifyQueryError("query connection activity health", err)
		slog.WarnContext(ctx, "failed to query connection activity health", slog.String("error", classified.Error()))
		health.PartialErrors = append(health.PartialErrors, engine.OverviewMetricError{
			Metric: "connection_activity",
			Err:    classified,
		})

		return health, nil
	}

	health.ConnectionActivity = activity

	return health, nil
}

// queryConnectionActivityHealth reads the scalar counts, the by-application
// breakdown, and the session rows inside one transaction: pg_stat_activity is
// snapshotted on first access per transaction, so all three views agree on the
// same set of backends instead of each seeing its own instant.
func queryConnectionActivityHealth(ctx context.Context, db *sql.DB) (*engine.ConnectionActivityHealth, error) {
	tx, err := db.BeginTx(ctx, &sql.TxOptions{ReadOnly: true})
	if err != nil {
		return nil, classifyQueryError("begin connection activity transaction", err)
	}

	defer func() { _ = tx.Rollback() }()

	var activity engine.ConnectionActivityHealth
	if err := tx.QueryRowContext(ctx, getConnectionActivityHealthQuery).Scan(
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

	byApplication, err := queryConnectionActivityByApplication(ctx, tx)
	if err != nil {
		// The per-application breakdown is supplementary; keep the authoritative
		// scalar counts even when it fails.
		slog.WarnContext(ctx, "failed to query connections by application", slog.String("error", err.Error()))
	} else {
		activity.ByApplication = byApplication
	}

	sessions, err := queryConnectionActivitySessions(ctx, tx)
	if err != nil {
		// Session rows are supplementary; keep the authoritative scalar counts
		// even when detail visibility is unavailable.
		slog.WarnContext(ctx, "failed to query activity sessions", slog.String("error", err.Error()))
	} else {
		activity.Sessions = sessions
	}

	return &activity, nil
}

func queryConnectionActivityByApplication(ctx context.Context, tx *sql.Tx) ([]engine.ApplicationConnections, error) {
	rows, err := tx.QueryContext(ctx, getConnectionActivityByApplicationQuery)
	if err != nil {
		return nil, classifyQueryError("query connections by application", err)
	}
	defer rows.Close()

	var apps []engine.ApplicationConnections

	for rows.Next() {
		var app engine.ApplicationConnections
		if err := rows.Scan(
			&app.ApplicationName,
			&app.Active,
			&app.Idle,
			&app.IdleInTransaction,
			&app.Total,
		); err != nil {
			return nil, classifyQueryError("scan connections by application", err)
		}

		apps = append(apps, app)
	}

	if err := rows.Err(); err != nil {
		return nil, classifyQueryError("iterate connections by application", err)
	}

	return apps, nil
}

func queryConnectionActivitySessions(ctx context.Context, tx *sql.Tx) ([]engine.ConnectionActivitySession, error) {
	rows, err := tx.QueryContext(ctx, getConnectionActivitySessionsQuery)
	if err != nil {
		return nil, classifyQueryError("query activity sessions", err)
	}
	defer rows.Close()

	var sessions []engine.ConnectionActivitySession

	for rows.Next() {
		var (
			session                  engine.ConnectionActivitySession
			transactionAge, queryAge sql.NullInt64
		)

		if err := rows.Scan(
			&session.PID,
			&session.Username,
			&session.ApplicationName,
			&session.DatabaseName,
			&session.State,
			&session.DurationSeconds,
			&session.Query,
			&session.WaitEventType,
			&session.WaitEvent,
			&session.BlockedByPID,
			&session.BackendAgeSeconds,
			&transactionAge,
			&queryAge,
			&session.ClientAddress,
			&session.ClientPort,
		); err != nil {
			return nil, classifyQueryError("scan activity sessions", err)
		}

		if transactionAge.Valid {
			session.TransactionAgeSeconds = &transactionAge.Int64
		}

		if queryAge.Valid {
			session.QueryAgeSeconds = &queryAge.Int64
		}

		sessions = append(sessions, session)
	}

	if err := rows.Err(); err != nil {
		return nil, classifyQueryError("iterate activity sessions", err)
	}

	return sessions, nil
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

func queryAutovacuumHealth(ctx context.Context, db *sql.DB) (*engine.AutovacuumHealth, error) {
	var (
		autovacuum       engine.AutovacuumHealth
		lastAutovacuumAt sql.NullTime
	)
	if err := db.QueryRowContext(ctx, getAutovacuumHealthQuery).Scan(
		&autovacuum.RunningWorkers,
		&autovacuum.MaxWorkers,
		&lastAutovacuumAt,
	); err != nil {
		return nil, classifyQueryError("query autovacuum health", err)
	}

	if lastAutovacuumAt.Valid {
		lastAt := lastAutovacuumAt.Time
		autovacuum.LastAutovacuumAt = &lastAt
	}

	autovacuum.Status, autovacuum.Summary = summarizeAutovacuum(autovacuum)

	return &autovacuum, nil
}

// summarizeAutovacuum classifies autovacuum worker saturation. It only warns
// when every worker is busy (autovacuum may be falling behind); it never warns
// on the age of the last run, since a low-write database legitimately has an
// old or absent LastAutovacuumAt.
func summarizeAutovacuum(autovacuum engine.AutovacuumHealth) (engine.HealthStatus, string) {
	if autovacuum.MaxWorkers <= 0 {
		return engine.HealthStatusUnknown, "autovacuum_max_workers is not reported"
	}

	lastRan := "no autovacuum recorded yet"
	if autovacuum.LastAutovacuumAt != nil {
		lastRan = fmt.Sprintf("last ran %s ago", humanizeDuration(time.Since(*autovacuum.LastAutovacuumAt)))
	}

	summary := fmt.Sprintf("%d of %d workers active; %s", autovacuum.RunningWorkers, autovacuum.MaxWorkers, lastRan)

	if autovacuum.RunningWorkers >= autovacuum.MaxWorkers {
		return engine.HealthStatusWarning, summary
	}

	return engine.HealthStatusOK, summary
}

// humanizeDuration renders a coarse relative age using the single largest
// whole unit (seconds, minutes, hours, days). Negative inputs clamp to 0s.
func humanizeDuration(d time.Duration) string {
	if d < 0 {
		d = 0
	}

	switch {
	case d < time.Minute:
		return fmt.Sprintf("%ds", int(d.Seconds()))
	case d < time.Hour:
		return fmt.Sprintf("%dm", int(d.Minutes()))
	case d < 24*time.Hour:
		return fmt.Sprintf("%dh", int(d.Hours()))
	default:
		return fmt.Sprintf("%dd", int(d.Hours()/24))
	}
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
