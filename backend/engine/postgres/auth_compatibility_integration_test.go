package postgres_test

import (
	"context"
	"database/sql"
	"fmt"
	"net/url"
	"strings"
	"sync"
	"testing"
	"time"
	"unicode/utf8"

	"github.com/jackc/pgx/v5/pgconn"
	"github.com/stretchr/testify/assert"
	"github.com/stretchr/testify/require"

	"github.com/querylane/querylane/backend/engine"
	"github.com/querylane/querylane/backend/integration/testutil"
)

func (s *PostgresEngineIntegrationTestSuite) TestPostgres19PasswordAuthenticationWarnings() {
	t := s.T()
	s.requirePostgresAtLeast(t.Context(), s.db, 19)
	ctx, cancel := context.WithTimeout(t.Context(), 90*time.Second)
	defer cancel()
	container := testutil.RequirePostgreSQLAuthenticationContainer(ctx, s.T())
	s.T().Cleanup(func() {
		cleanupCtx, cleanupCancel := context.WithTimeout(context.Background(), 30*time.Second)
		defer cleanupCancel()
		assert.NoError(t, container.Cleanup(cleanupCtx))
	})
	dsn, err := container.ConnectionString(ctx)
	s.Require().NoError(err)
	admin, err := sql.Open("pgx", dsn)
	s.Require().NoError(err)
	defer admin.Close()

	// SET LOCAL keeps each password algorithm in its own fixture transaction.
	// Both validity dates come from the server clock, not the test runner clock.
	var expiresSoon, expired string
	s.Require().NoError(admin.QueryRowContext(ctx, `SELECT (now() + interval '1 day')::text, (now() - interval '1 day')::text`).Scan(&expiresSoon, &expired))
	for _, algorithm := range []string{"md5", "scram-sha-256"} {
		prefix := "auth_md5"
		if algorithm == "scram-sha-256" {
			prefix = "auth_scram"
		}
		_, err = admin.ExecContext(ctx, fmt.Sprintf(`BEGIN;
 SET LOCAL password_encryption = '%s';
 CREATE ROLE %s LOGIN PASSWORD 'auth-test-password';
 CREATE ROLE %s_expiring LOGIN PASSWORD 'auth-test-password' VALID UNTIL '%s';
 CREATE ROLE %s_expired LOGIN PASSWORD 'auth-test-password' VALID UNTIL '%s';
 COMMIT;`, algorithm, prefix, prefix, expiresSoon, prefix, expired))
		s.Require().NoError(err)
	}
	_, err = admin.ExecContext(ctx, `CREATE ROLE auth_no_login NOLOGIN PASSWORD 'auth-test-password'`)
	s.Require().NoError(err)
	var md5Stored, scramStored bool
	s.Require().NoError(admin.QueryRowContext(ctx, `SELECT
 (SELECT rolpassword LIKE 'md5%' FROM pg_authid WHERE rolname = 'auth_md5'),
 (SELECT rolpassword LIKE 'SCRAM-SHA-256$%' FROM pg_authid WHERE rolname = 'auth_scram')`).Scan(&md5Stored, &scramStored))
	s.Require().True(md5Stored, "the legacy test must actually use an MD5-stored password")
	s.Require().True(scramStored, "the modern test must actually negotiate SCRAM")

	openPool := func(t *testing.T, role, password string) *sql.DB {
		t.Helper()
		parsed, parseErr := url.Parse(dsn)
		require.NoError(t, parseErr)
		parsed.User = url.UserPassword(role, password)
		pool, openErr := engine.OpenPostgresDB(parsed.String())
		require.NoError(t, openErr)
		pool.SetMaxOpenConns(1)
		t.Cleanup(func() { assert.NoError(t, pool.Close()) })
		return pool
	}
	cases := []struct {
		role   string
		md5    bool
		expiry bool
	}{
		{role: "auth_md5", md5: true},
		{role: "auth_md5_expiring", md5: true, expiry: true},
		{role: "auth_scram"},
		{role: "auth_scram_expiring", expiry: true},
	}
	assertWarnings := func(t *testing.T, notices []string, md5, expiry bool) {
		t.Helper()
		count := 0
		if md5 {
			count++
		}
		if expiry {
			count++
		}
		assert.Len(t, notices, count)
		joined := strings.Join(notices, "\n")
		assert.Equal(t, md5, strings.Contains(joined, "MD5"))
		assert.Equal(t, expiry, strings.Contains(joined, "expire"))
		for _, notice := range notices {
			assert.Contains(t, notice, "WARNING ")
			assert.NotContains(t, notice, "auth-test-password")
		}
		t.Logf("authentication notices: %q", notices)
	}

	for _, tc := range cases {
		s.Run(tc.role, func() {
			t := s.T()
			pool := openPool(t, tc.role, "auth-test-password")
			// Pool warmup/health checks must not discard authentication warnings.
			require.NoError(t, pool.PingContext(ctx))
			session, beginErr := engine.BeginPostgresNoticeSession(ctx, pool)
			require.NoError(t, beginErr)
			defer session.Close()
			assertWarnings(t, session.Notices(), tc.md5, tc.expiry)
			var login string
			require.NoError(t, session.Conn().QueryRowContext(ctx, `SELECT current_user`).Scan(&login))
			assert.Equal(t, tc.role, login)
			require.NoError(t, session.Close())
			assert.Empty(t, s.executeQueryStats(ctx, pool, "SELECT 1").Notices,
				"authentication notices are delivered once per physical connection, not once per pooled request")

			cold := openPool(t, tc.role, "auth-test-password")
			first := s.executeQueryStats(ctx, cold, "SELECT current_user")
			assert.Equal(t, int64(1), first.RowCount)
			assertWarnings(t, first.Notices, tc.md5, tc.expiry)
			assert.Empty(t, s.executeQueryStats(ctx, cold, "SELECT 1").Notices)
		})
	}

	s.Run("failed_logins", func() {
		for _, tc := range []struct {
			role, password, code string
		}{
			{"auth_md5", "wrong-password", "28P01"},
			{"auth_scram", "wrong-password", "28P01"},
			{"auth_md5_expired", "auth-test-password", "28P01"},
			{"auth_scram_expired", "auth-test-password", "28P01"},
			{"auth_unknown", "auth-test-password", "28P01"},
			{"auth_no_login", "auth-test-password", "28000"},
		} {
			s.Run(tc.role, func() {
				t := s.T()
				pool := openPool(t, tc.role, tc.password)
				session, beginErr := engine.BeginPostgresNoticeSession(ctx, pool)
				assert.Nil(t, session)
				var pgErr *pgconn.PgError
				require.ErrorAs(t, beginErr, &pgErr)
				assert.Equal(t, tc.code, pgErr.Code)
				stream, executeErr := s.eng.ExecuteQuery(ctx, pool, engine.ExecuteQueryParams{Statement: "SELECT 1", Timeout: time.Second})
				assert.Nil(t, stream, "failed authentication must not produce a successful SQL stream")
				require.ErrorAs(t, executeErr, &pgErr)
				assert.Equal(t, tc.code, pgErr.Code)
				assert.NotContains(t, executeErr.Error(), tc.password)
			})
		}
	})

	s.Run("concurrent_logins_and_pooled_requests", func() {
		t := s.T()
		type result struct {
			index   int
			pid     int
			notices []string
			err     error
		}
		pools := []*sql.DB{openPool(t, "auth_md5_expiring", "auth-test-password"), openPool(t, "auth_scram", "auth-test-password")}
		for _, pool := range pools {
			pool.SetMaxOpenConns(2)
			pool.SetMaxIdleConns(2)
		}
		const requests = 4
		start, release := make(chan struct{}), make(chan struct{})
		results := make(chan result, requests)
		var workers sync.WaitGroup
		var releaseOnce sync.Once
		finish := func() { releaseOnce.Do(func() { close(release) }); workers.Wait() }
		for i := range requests {
			workers.Go(func() {
				<-start
				r := result{index: i}
				session, beginErr := engine.BeginPostgresNoticeSession(ctx, pools[i%len(pools)])
				if beginErr != nil {
					r.err = beginErr
					results <- r
					return
				}
				defer session.Close()
				_, r.err = session.Conn().ExecContext(ctx, fmt.Sprintf(`DO $$ BEGIN RAISE NOTICE 'request-%d'; END $$`, i))
				if r.err == nil {
					r.err = session.Conn().QueryRowContext(ctx, `SELECT pg_backend_pid()`).Scan(&r.pid)
				}
				r.notices = session.Notices()
				results <- r
				// Keep every connection reserved until all logins/queries finish.
				<-release
			})
		}
		defer finish()
		close(start)
		pids := make(map[int]bool, requests)
		for range requests {
			select {
			case r := <-results:
				require.NoError(t, r.err)
				assert.False(t, pids[r.pid], "each overlapping request needs its own physical connection")
				pids[r.pid] = true
				joined := strings.Join(r.notices, "\n")
				assert.Contains(t, joined, fmt.Sprintf("request-%d", r.index))
				for other := range requests {
					if other != r.index {
						assert.NotContains(t, joined, fmt.Sprintf("request-%d", other))
					}
				}
				assert.Equal(t, r.index%2 == 0, strings.Contains(joined, "MD5"))
				assert.Equal(t, r.index%2 == 0, strings.Contains(joined, "expire"))
			case <-ctx.Done():
				t.Fatal(ctx.Err())
			}
		}
		finish()
		for _, pool := range pools {
			first, firstErr := engine.BeginPostgresNoticeSession(ctx, pool)
			require.NoError(t, firstErr)
			defer first.Close()
			second, secondErr := engine.BeginPostgresNoticeSession(ctx, pool)
			require.NoError(t, secondErr)
			defer second.Close()
			assert.Empty(t, first.Notices())
			assert.Empty(t, second.Notices(), "neither pooled connection can replay startup or another request's notices")
		}
	})

	s.Run("startup_and_query_notices_share_bounds", func() {
		t := s.T()
		pool := openPool(t, "auth_md5_expiring", "auth-test-password")
		session, beginErr := engine.BeginPostgresNoticeSession(ctx, pool)
		require.NoError(t, beginErr)
		defer session.Close()
		assertWarnings(t, session.Notices(), true, true)
		_, err = session.Conn().ExecContext(ctx, `DO $$ BEGIN
 FOR i IN 1..110 LOOP RAISE NOTICE '%', repeat('🙂', 2000); END LOOP;
 END $$`)
		require.NoError(t, err)
		notices := session.Notices()
		require.Len(t, notices, 101)
		assert.Equal(t, "QUERYLANE_NOTICE_TRUNCATED: 12 additional database notices omitted", notices[100])
		for _, notice := range notices {
			assert.LessOrEqual(t, len(notice), 4096)
			assert.True(t, utf8.ValidString(notice))
		}
		require.NoError(t, session.Close())
		assert.Empty(t, s.executeQueryStats(ctx, pool, "SELECT 1").Notices)
	})

	s.Run("stream_close_preserves_final_notices", func() {
		t := s.T()
		_, createErr := admin.ExecContext(ctx, `CREATE FUNCTION public.auth_row_notice(n int, fail boolean) RETURNS int
 LANGUAGE plpgsql AS $$ BEGIN
 RAISE NOTICE 'row-%', n;
 IF fail AND n = 3 THEN RAISE EXCEPTION USING ERRCODE = '22012', MESSAGE = 'fixture stream failure'; END IF;
 RETURN n;
 END $$`)
		require.NoError(t, createErr)
		for _, tc := range []struct {
			name       string
			rows       int
			rowLimit   int
			earlyClose bool
			fail       bool
		}{
			{name: "row_limit", rows: 3, rowLimit: 1},
			{name: "early_close", rows: 3, earlyClose: true},
			{name: "late_statement_error", rows: 3, rowLimit: 1, fail: true},
			{name: "bounded_drain", rows: 110, rowLimit: 1},
		} {
			s.Run(tc.name, func() {
				t := s.T()
				pool := openPool(t, "auth_scram", "auth-test-password")
				stream, executeErr := s.eng.ExecuteQuery(ctx, pool, engine.ExecuteQueryParams{
					Statement: fmt.Sprintf("SELECT public.auth_row_notice(n, %t) FROM generate_series(1, %d) AS n", tc.fail, tc.rows),
					Timeout:   time.Second,
					RowLimit:  tc.rowLimit,
				})
				require.NoError(t, executeErr)
				defer stream.Close()
				for stream.Next() {
					if tc.earlyClose {
						break
					}
				}
				closeErr := stream.Close()
				if tc.fail {
					var pgErr *pgconn.PgError
					require.ErrorAs(t, closeErr, &pgErr)
					assert.Equal(t, "22012", pgErr.Code, "draining must preserve statement/close failures")
				} else {
					require.NoError(t, closeErr)
				}
				assert.Equal(t, !tc.earlyClose, stream.Stats().Truncated)
				assert.Equal(t, int64(1), stream.Stats().RowCount)
				notices := stream.Stats().Notices
				if tc.rows > 100 {
					require.Len(t, notices, 101)
					assert.Contains(t, notices[99], "row-100")
					assert.Equal(t, "QUERYLANE_NOTICE_TRUNCATED: 10 additional database notices omitted", notices[100])
				} else {
					require.Len(t, notices, tc.rows)
					for i := range tc.rows {
						assert.Contains(t, notices[i], fmt.Sprintf("row-%d", i+1))
					}
				}
				assert.Empty(t, s.executeQueryStats(ctx, pool, "SELECT 1").Notices)
			})
		}
	})
}
