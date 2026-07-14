package engine

import (
	"context"
	"database/sql"
	"fmt"
	"testing"
	"time"

	"github.com/stretchr/testify/require"

	"github.com/querylane/querylane/backend/storage"
)

func TestPostgresEndpointFromDSNUsesOnlyHostAndPort(t *testing.T) {
	t.Parallel()

	first, err := postgresEndpointFromDSN("postgres://alice:top-secret@db.example.com:5432/app")
	require.NoError(t, err)
	second, err := postgresEndpointFromDSN("postgres://bob:different-secret@db.example.com:5432/analytics")
	require.NoError(t, err)
	differentPort, err := postgresEndpointFromDSN("postgres://alice:top-secret@db.example.com:5433/app")
	require.NoError(t, err)

	require.Equal(t, first, second)
	require.NotEqual(t, first, differentPort)
	require.NotContains(t, fmt.Sprint(first), "secret")
	require.NotContains(t, fmt.Sprint(first), "alice")
}

func TestPostgresEndpointFromDSNCanonicalizesNetworkHosts(t *testing.T) {
	t.Parallel()

	tests := []struct {
		name   string
		first  string
		second string
	}{
		{
			name:   "dns case and trailing dots",
			first:  "postgres://user@DB.Example.COM...:5432/app",
			second: "postgres://user@db.example.com:5432/other",
		},
		{
			name:   "ipv6 spelling",
			first:  "postgres://user@[2001:0db8:0:0:0:0:0:1]:5432/app",
			second: "postgres://user@[2001:db8::1]:5432/other",
		},
	}

	for _, tc := range tests {
		t.Run(tc.name, func(t *testing.T) {
			t.Parallel()

			first, err := postgresEndpointFromDSN(tc.first)
			require.NoError(t, err)
			second, err := postgresEndpointFromDSN(tc.second)
			require.NoError(t, err)

			require.Equal(t, first, second)
		})
	}
}

func TestPostgresEndpointFromDSNPreservesUnixSocketPath(t *testing.T) {
	t.Parallel()

	endpoint, err := postgresEndpointFromDSN("host=/var/run/PostgreSQL... port=5432 dbname=app user=alice")
	require.NoError(t, err)

	require.Equal(t, "/var/run/PostgreSQL...", endpoint.host)
}

func TestConnectionBudgetBoundsConcurrentConnections(t *testing.T) {
	t.Parallel()

	budget := newConnectionBudget(2, 0)

	releaseFirst, err := budget.acquire(t.Context())
	require.NoError(t, err)
	releaseSecond, err := budget.acquire(t.Context())
	require.NoError(t, err)

	blockedCtx, cancel := context.WithTimeout(t.Context(), 20*time.Millisecond)
	defer cancel()

	_, err = budget.acquire(blockedCtx)
	require.ErrorIs(t, err, context.DeadlineExceeded)

	releaseFirst()

	releaseThird, err := budget.acquire(t.Context())
	require.NoError(t, err)

	// Releases must be safe when cleanup paths converge.
	releaseFirst()
	releaseSecond()
	releaseThird()
}

func TestIntegrationOpenPostgresDBWithBudgetBoundsPoolsTogether(t *testing.T) {
	t.Parallel()

	testDB := storage.NewTestDB(t)
	dsn := ConfigToDSN(testInstance(t, testDB, mustParseInstanceName(t, "instances/shared-budget")).GetConfig())
	budget := newConnectionBudget(2, 0)

	dbs := make([]*sql.DB, 3)
	for i := range dbs {
		var err error

		dbs[i], err = openPostgresDBWithBudget(dsn, budget, nil)
		require.NoError(t, err)
		dbs[i].SetMaxOpenConns(2)
		dbs[i].SetMaxIdleConns(0)
		t.Cleanup(func() { require.NoError(t, dbs[i].Close()) })
	}

	first, err := dbs[0].Conn(t.Context())
	require.NoError(t, err)

	defer first.Close()

	second, err := dbs[1].Conn(t.Context())
	require.NoError(t, err)

	defer second.Close()

	blockedCtx, cancel := context.WithTimeout(t.Context(), 50*time.Millisecond)
	defer cancel()

	_, err = dbs[2].Conn(blockedCtx)
	require.ErrorIs(t, err, context.DeadlineExceeded, "third pool should wait on the shared physical budget: %v", err)

	require.NoError(t, first.Close())

	thirdCtx, thirdCancel := context.WithTimeout(t.Context(), time.Second)
	defer thirdCancel()

	third, err := dbs[2].Conn(thirdCtx)
	require.NoError(t, err)
	require.NoError(t, third.Close())
}

func TestIntegrationBudgetedPostgresDBSupportsNoticeCapture(t *testing.T) {
	t.Parallel()

	testDB := storage.NewTestDB(t)
	dsn := ConfigToDSN(testInstance(t, testDB, mustParseInstanceName(t, "instances/budgeted-notices")).GetConfig())
	db, err := openPostgresDBWithBudget(dsn, newConnectionBudget(1, 0), nil)
	require.NoError(t, err)
	t.Cleanup(func() { require.NoError(t, db.Close()) })

	session, err := BeginPostgresNoticeSession(t.Context(), db)
	require.NoError(t, err)

	defer session.Close()

	_, err = session.Conn().ExecContext(t.Context(), `DO $$ BEGIN RAISE NOTICE 'budgeted notice'; END $$`)
	require.NoError(t, err)

	notices := session.Notices()
	require.Len(t, notices, 1)
	require.Contains(t, notices[0], "NOTICE 00000: budgeted notice")
}
