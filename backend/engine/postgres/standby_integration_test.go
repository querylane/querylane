package postgres_test

import (
	"context"
	"database/sql"
	"net/url"
	"testing"
	"time"

	"github.com/stretchr/testify/assert"
	"github.com/stretchr/testify/require"

	"github.com/querylane/querylane/backend/engine"
	"github.com/querylane/querylane/backend/engine/postgres"
	"github.com/querylane/querylane/backend/integration/testutil"
	"github.com/querylane/querylane/backend/postgreserrors"
)

//nolint:paralleltest,tparallel // Subtests deliberately sequence observations, ACL changes, replay pause, and promotion of the same disposable pair.
func TestStandbyHealthIntegration(t *testing.T) {
	t.Parallel()
	if testing.Short() {
		t.Skip("physical streaming replication requires Docker")
	}
	ctx, cancel := context.WithTimeout(t.Context(), 2*time.Minute)
	defer cancel()
	fixture := testutil.RequirePostgreSQLReplication(ctx, t)
	primaryDSN, err := fixture.Primary.ConnectionString(ctx)
	require.NoError(t, err)
	standbyDSN, err := fixture.StandbyConnectionString(ctx)
	require.NoError(t, err)
	openDB := func(t *testing.T, dsn string) *sql.DB {
		t.Helper()
		db, openErr := engine.OpenPostgresDB(dsn)
		require.NoError(t, openErr)
		t.Cleanup(func() { assert.NoError(t, db.Close()) })
		require.NoError(t, db.PingContext(ctx))
		return db
	}
	primary := openDB(t, primaryDSN)
	standby := openDB(t, standbyDSN)
	var version string
	var versionNum int
	require.NoError(t, standby.QueryRowContext(ctx, "SELECT version(), current_setting('server_version_num')::int").Scan(&version, &versionNum))
	t.Logf("physical standby compatibility target: %s", version)
	require.Eventually(t, func() bool {
		var streaming bool
		return standby.QueryRowContext(ctx, "SELECT EXISTS (SELECT FROM pg_stat_wal_receiver WHERE status = 'streaming')").Scan(&streaming) == nil && streaming
	}, 10*time.Second, 25*time.Millisecond, "real WAL receiver must be streaming")

	tokens, err := engine.NewRandomTokenCodec()
	require.NoError(t, err)
	eng := postgres.New(tokens)
	// A fresh base backup has no replayed commit/abort timestamp yet. That is
	// unknown age, not the zero-second value of a caught-up transaction.
	var replayTimestamp sql.NullTime
	require.NoError(t, standby.QueryRowContext(ctx, "SELECT pg_last_xact_replay_timestamp()").Scan(&replayTimestamp))
	require.False(t, replayTimestamp.Valid)
	initialHealth, err := eng.CheckInstanceHealth(ctx, standby)
	require.NoError(t, err)
	require.NotNil(t, initialHealth.Replication)
	assert.True(t, initialHealth.Replication.StatisticsVisible)
	assert.False(t, initialHealth.Replication.ReplayLagKnown)
	assert.Equal(t, engine.HealthStatusWarning, initialHealth.Replication.Status)
	assert.Contains(t, initialHealth.Replication.Summary, "no transaction replay timestamp available")
	if versionNum >= 190000 {
		var pauseState, replayEndLSN string
		var promotionTriggered bool
		var replayTimeline int32
		require.NoError(t, standby.QueryRowContext(ctx, "SELECT pause_state, promote_triggered, replay_end_lsn::text, replay_end_tli FROM pg_catalog.pg_stat_recovery").Scan(&pauseState, &promotionTriggered, &replayEndLSN, &replayTimeline))
		t.Logf("native pg_stat_recovery: pause_state=%s promote_triggered=%t replay_end_lsn=%s replay_end_tli=%d", pauseState, promotionTriggered, replayEndLSN, replayTimeline)
		require.NotNil(t, initialHealth.Replication.Recovery, "native PostgreSQL 19 recovery state should be exposed")
		assert.Equal(t, engine.RecoveryAvailable, initialHealth.Replication.Recovery.Availability)
		assert.Equal(t, pauseState, initialHealth.Replication.Recovery.PauseState)
		assert.Equal(t, promotionTriggered, initialHealth.Replication.Recovery.PromotionTriggered)
		assert.NotEmpty(t, initialHealth.Replication.Recovery.ReplayEndLSN)
		assert.Positive(t, initialHealth.Replication.Recovery.ReplayTimeline)
	}

	// Independent login sessions ensure pgx never inherits the setup superuser.
	_, err = primary.ExecContext(ctx, `CREATE ROLE health_restricted LOGIN PASSWORD 'health-test';
CREATE ROLE health_reader LOGIN PASSWORD 'health-test' IN ROLE pg_read_all_stats;
CREATE ROLE health_noinherit LOGIN NOINHERIT PASSWORD 'health-test' IN ROLE pg_read_all_stats;
CREATE TABLE replication_health_marker(id integer);
INSERT INTO replication_health_marker VALUES (1);`)
	require.NoError(t, err)
	require.Eventually(t, func() bool {
		var exists bool
		return standby.QueryRowContext(ctx, "SELECT EXISTS (SELECT FROM pg_roles WHERE rolname = 'health_noinherit') AND to_regclass('public.replication_health_marker') IS NOT NULL").Scan(&exists) == nil && exists
	}, 10*time.Second, 25*time.Millisecond)

	for _, tc := range []struct {
		name    string
		visible bool
	}{
		{"health_restricted", false},
		{"health_reader", true},
		{"health_noinherit", false},
	} {
		t.Run(tc.name, func(t *testing.T) {
			login := func(dsn string) *sql.DB {
				u, parseErr := url.Parse(dsn)
				require.NoError(t, parseErr)
				u.User = url.UserPassword(tc.name, "health-test")
				return openDB(t, u.String())
			}
			for _, target := range []struct {
				name string
				db   *sql.DB
				role engine.ReplicationRole
			}{
				{"standby", login(standbyDSN), engine.ReplicationRoleReplica},
				{"primary", login(primaryDSN), engine.ReplicationRolePrimary},
			} {
				t.Run(target.name, func(t *testing.T) {
					var sessionUser, currentUser string
					require.NoError(t, target.db.QueryRowContext(ctx, "SELECT session_user, current_user").Scan(&sessionUser, &currentUser))
					require.Equal(t, tc.name, sessionUser)
					require.Equal(t, tc.name, currentUser)
					health, healthErr := eng.CheckInstanceHealth(ctx, target.db)
					require.NoError(t, healthErr)
					require.NotNil(t, health.Replication)
					assert.Equal(t, target.role, health.Replication.Role)
					assert.Equal(t, tc.visible, health.Replication.StatisticsVisible)
					require.NotNil(t, health.StatsAccess)
					assert.Equal(t, tc.visible, health.StatsAccess.PGReadAllStatsMember, "NOINHERIT membership is not effective stats access")
					if !tc.visible {
						assert.Equal(t, engine.HealthStatusWarning, health.StatsAccess.Status)
					}
					require.NotNil(t, health.Replication.Recovery)
					switch {
					case versionNum < 190000:
						assert.Equal(t, engine.RecoveryUnsupported, health.Replication.Recovery.Availability)
					case target.role == engine.ReplicationRolePrimary:
						assert.Equal(t, engine.RecoveryNotApplicable, health.Replication.Recovery.Availability)
					case !tc.visible:
						var visibleRows int
						require.NoError(t, target.db.QueryRowContext(ctx, "SELECT count(*) FROM pg_catalog.pg_stat_recovery").Scan(&visibleRows))
						assert.Zero(t, visibleRows, "PostgreSQL hides recovery rows from restricted roles")
						assert.Equal(t, engine.RecoveryRestricted, health.Replication.Recovery.Availability)
					default:
						assert.Equal(t, engine.RecoveryAvailable, health.Replication.Recovery.Availability)
						assert.Equal(t, "not paused", health.Replication.Recovery.PauseState)
						assert.False(t, health.Replication.Recovery.PromotionTriggered)
						assert.NotEmpty(t, health.Replication.Recovery.ReplayEndLSN)
						assert.Positive(t, health.Replication.Recovery.ReplayTimeline)
					}
					if tc.visible {
						assert.Equal(t, engine.HealthStatusOK, health.Replication.Status)
					} else {
						assert.Equal(t, engine.HealthStatusWarning, health.Replication.Status, "masked details must not be reported healthy")
						assert.Contains(t, health.Replication.Summary, "statistics visibility is restricted")
					}
					if target.role == engine.ReplicationRoleReplica {
						assert.True(t, health.Replication.WALReceiverActive, "receiver PID is public even when its details are hidden")
						assert.True(t, health.Replication.ReplayLagKnown, "replayed transaction timestamp is public independently of statistics privileges")
					} else {
						assert.Equal(t, int32(1), health.Replication.AttachedReplicas)
						if tc.visible {
							assert.Equal(t, int32(1), health.Replication.StreamingReplicas)
						}
					}
					require.NotNil(t, health.ConnectionActivity, "replication visibility must not suppress unrelated health checks")
					require.NotNil(t, health.StatsAccess)
					require.NotNil(t, health.Autovacuum)
				})
			}
		})
	}

	if versionNum >= 190000 {
		t.Run("replay_pause_and_resume", func(t *testing.T) {
			_, pauseErr := standby.ExecContext(ctx, "SELECT pg_wal_replay_pause()")
			require.NoError(t, pauseErr)
			t.Cleanup(func() { _, _ = standby.ExecContext(ctx, "SELECT pg_wal_replay_resume()") })
			require.Eventually(t, func() bool {
				var pauseState string
				return standby.QueryRowContext(ctx, "SELECT pg_get_wal_replay_pause_state()").Scan(&pauseState) == nil && pauseState == "paused"
			}, 10*time.Second, 25*time.Millisecond)
			_, insertErr := primary.ExecContext(ctx, "INSERT INTO replication_health_marker VALUES (2)")
			require.NoError(t, insertErr)
			var rows int
			require.NoError(t, standby.QueryRowContext(ctx, "SELECT count(*) FROM replication_health_marker").Scan(&rows))
			assert.Equal(t, 1, rows, "paused standby has not applied the new primary transaction")
			health, healthErr := eng.CheckInstanceHealth(ctx, standby)
			require.NoError(t, healthErr)
			require.NotNil(t, health.Replication)
			require.NotNil(t, health.Replication.Recovery)
			assert.Equal(t, engine.RecoveryAvailable, health.Replication.Recovery.Availability)
			assert.Equal(t, "paused", health.Replication.Recovery.PauseState)
			assert.Equal(t, engine.HealthStatusWarning, health.Replication.Status)
			assert.Contains(t, health.Replication.Summary, "WAL replay is paused")
			_, resumeErr := standby.ExecContext(ctx, "SELECT pg_wal_replay_resume()")
			require.NoError(t, resumeErr)
			require.Eventually(t, func() bool {
				return standby.QueryRowContext(ctx, "SELECT count(*) FROM replication_health_marker").Scan(&rows) == nil && rows == 2
			}, 10*time.Second, 25*time.Millisecond)
		})

		t.Run("recovery_permission_error_isolated", func(t *testing.T) {
			_, revokeErr := primary.ExecContext(ctx, "REVOKE EXECUTE ON FUNCTION pg_catalog.pg_stat_get_recovery() FROM PUBLIC")
			require.NoError(t, revokeErr)
			require.Eventually(t, func() bool {
				var allowed bool
				return standby.QueryRowContext(ctx, "SELECT has_function_privilege('health_reader', 'pg_catalog.pg_stat_get_recovery()', 'EXECUTE')").Scan(&allowed) == nil && !allowed
			}, 10*time.Second, 25*time.Millisecond)
			u, parseErr := url.Parse(standbyDSN)
			require.NoError(t, parseErr)
			u.User = url.UserPassword("health_reader", "health-test")
			health, healthErr := eng.CheckInstanceHealth(ctx, openDB(t, u.String()))
			require.NoError(t, healthErr)
			require.NotNil(t, health.Replication, "an optional recovery failure must preserve base replication health")
			assert.True(t, health.Replication.WALReceiverActive)
			require.NotNil(t, health.Replication.Recovery)
			assert.Equal(t, engine.RecoveryRestricted, health.Replication.Recovery.Availability)
			require.NotNil(t, health.ConnectionActivity)
			require.NotNil(t, health.StatsAccess)
			require.NotNil(t, health.Autovacuum)
			var recoveryErr error
			for _, partial := range health.PartialErrors {
				if partial.Metric == "recovery" {
					recoveryErr = partial.Err
				}
			}
			var pgErr *postgreserrors.Error
			require.ErrorAs(t, recoveryErr, &pgErr)
			assert.Equal(t, "42501", pgErr.Classification().SQLState)
		})
	}

	t.Run("permission_error_isolated", func(t *testing.T) {
		// Revoke only inside the disposable primary; physical replay applies the
		// ACL to the standby. This is a real 42501, not a mocked SQLSTATE.
		_, revokeErr := primary.ExecContext(ctx, "REVOKE EXECUTE ON FUNCTION pg_catalog.pg_stat_get_wal_receiver() FROM PUBLIC")
		require.NoError(t, revokeErr)
		require.Eventually(t, func() bool {
			var allowed bool
			return standby.QueryRowContext(ctx, "SELECT has_function_privilege('health_reader', 'pg_catalog.pg_stat_get_wal_receiver()', 'EXECUTE')").Scan(&allowed) == nil && !allowed
		}, 10*time.Second, 25*time.Millisecond)
		u, parseErr := url.Parse(standbyDSN)
		require.NoError(t, parseErr)
		u.User = url.UserPassword("health_reader", "health-test")
		health, healthErr := eng.CheckInstanceHealth(ctx, openDB(t, u.String()))
		require.NoError(t, healthErr)
		assert.Nil(t, health.Replication)
		require.NotNil(t, health.ConnectionActivity)
		require.NotNil(t, health.StatsAccess)
		require.NotNil(t, health.Autovacuum)
		var replicationErr error
		for _, partial := range health.PartialErrors {
			if partial.Metric == "replication" {
				replicationErr = partial.Err
			}
		}
		var pgErr *postgreserrors.Error
		require.ErrorAs(t, replicationErr, &pgErr)
		assert.Equal(t, "42501", pgErr.Classification().SQLState)
	})

	require.NoError(t, fixture.StopPrimary(ctx))
	require.Eventually(t, func() bool {
		var active bool
		return standby.QueryRowContext(ctx, "SELECT EXISTS (SELECT FROM pg_stat_wal_receiver)").Scan(&active) == nil && !active
	}, 10*time.Second, 25*time.Millisecond)
	health, err := eng.CheckInstanceHealth(ctx, standby)
	require.NoError(t, err)
	require.NotNil(t, health.Replication)
	assert.Equal(t, engine.HealthStatusWarning, health.Replication.Status)
	assert.False(t, health.Replication.WALReceiverActive)
	assert.Contains(t, health.Replication.Summary, "without active WAL receiver")

	// Fence the former primary before promotion. Only disposable fixtures are
	// modified, and the promoted server must actually accept writes afterward.
	var promoted bool
	require.NoError(t, standby.QueryRowContext(ctx, "SELECT pg_promote(true, 10)").Scan(&promoted))
	require.True(t, promoted)
	health, err = eng.CheckInstanceHealth(ctx, standby)
	require.NoError(t, err)
	require.NotNil(t, health.Replication)
	assert.Equal(t, engine.ReplicationRolePrimary, health.Replication.Role)
	require.NotNil(t, health.Replication.Recovery)
	if versionNum >= 190000 {
		assert.Equal(t, engine.RecoveryNotApplicable, health.Replication.Recovery.Availability)
		var rows int
		require.NoError(t, standby.QueryRowContext(ctx, "SELECT count(*) FROM pg_catalog.pg_stat_recovery").Scan(&rows))
		assert.Zero(t, rows, "recovery view disappears after completed promotion")
	} else {
		assert.Equal(t, engine.RecoveryUnsupported, health.Replication.Recovery.Availability)
	}
	_, err = standby.ExecContext(ctx, "INSERT INTO replication_health_marker VALUES (3)")
	require.NoError(t, err, "promoted physical standby must accept writes")
}
