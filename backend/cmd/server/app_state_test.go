package server

import (
	"context"
	"database/sql"
	"database/sql/driver"
	"errors"
	"fmt"
	"testing"

	"github.com/jackc/pgerrcode"
	"github.com/jackc/pgx/v5/pgconn"
	"github.com/stretchr/testify/require"

	serverconfig "github.com/querylane/querylane/backend/config/server"
	"github.com/querylane/querylane/backend/dbsetup"
)

// stubConnector is a driver.Connector that never produces connections. It
// exists so tests can hold a real *sql.DB inside a dbState and observe whether
// dbState.close released it (a closed *sql.DB fails Ping with a distinct
// "database is closed" error).
type stubConnector struct{}

func (stubConnector) Connect(context.Context) (driver.Conn, error) {
	return nil, errors.New("stub: no connections")
}

func (stubConnector) Driver() driver.Driver { return stubDriver{} }

type stubDriver struct{}

func (stubDriver) Open(string) (driver.Conn, error) {
	return nil, errors.New("stub: no connections")
}

func newStubDB() *sql.DB { return sql.OpenDB(stubConnector{}) }

func requireDBClosed(t *testing.T, db *sql.DB) {
	t.Helper()
	require.EqualError(t, db.PingContext(t.Context()), "sql: database is closed")
}

func requireDBOpen(t *testing.T, db *sql.DB) {
	t.Helper()
	require.EqualError(t, db.PingContext(t.Context()), "stub: no connections")
}

// TestAppSetStateClosesPreviousState is the regression guard for the
// double-install leak: when a second dbState is ever installed (degraded-mode
// retry racing the onboarding wizard), the previously-installed state must be
// closed — App.Close only releases the current pointer, so an overwritten
// state would leak its runner goroutines and meta-DB pool forever.
func TestAppSetStateClosesPreviousState(t *testing.T) {
	t.Parallel()

	prevDB := newStubDB()
	nextDB := newStubDB()

	app := &App{}

	first := &dbState{postgresCl: prevDB}
	second := &dbState{postgresCl: nextDB}

	app.setState(first)
	requireDBOpen(t, prevDB)

	app.setState(second)

	requireDBClosed(t, prevDB)
	requireDBOpen(t, nextDB)
	require.Same(t, second, app.state.Load())
}

func TestAppSetStateKeepsStateWhenReinstallingSame(t *testing.T) {
	t.Parallel()

	db := newStubDB()
	app := &App{}
	state := &dbState{postgresCl: db}

	app.setState(state)
	app.setState(state)

	requireDBOpen(t, db)
	require.Same(t, state, app.state.Load())
}

func TestAppInitializeDatabaseWithConfigClosesStateWhenInstalledDuringBuild(t *testing.T) {
	t.Parallel()

	wizardState := &dbState{}
	loserDB := newStubDB()
	onReadyCalls := 0
	app := &App{
		onReady: func(context.Context, *dbState) {
			onReadyCalls++
		},
	}
	app.buildDatabaseFunc = func(context.Context, *serverconfig.Config, *dbsetup.Broadcaster) (*dbState, error) {
		app.setState(wizardState)

		return &dbState{postgresCl: loserDB}, nil
	}

	err := app.InitializeDatabaseWithConfig(t.Context(), &serverconfig.Config{})
	require.NoError(t, err)

	requireDBClosed(t, loserDB)
	require.Same(t, wizardState, app.state.Load())
	require.Zero(t, onReadyCalls)
}

func TestAppInitializeDatabaseWithConfigRedactsDatabaseInitError(t *testing.T) {
	t.Parallel()

	pgErr := &pgconn.PgError{
		Code:    pgerrcode.InvalidPassword,
		Message: "password for meta_user contains api_key=secret",
	}
	app := &App{
		buildDatabaseFunc: func(context.Context, *serverconfig.Config, *dbsetup.Broadcaster) (*dbState, error) {
			return nil, fmt.Errorf("initialize database: %w", pgErr)
		},
	}

	err := app.InitializeDatabaseWithConfig(t.Context(), &serverconfig.Config{})

	require.ErrorContains(t, err, "api_key=secret")
	require.Contains(t, app.DatabaseInitError(), pgerrcode.InvalidPassword)
	require.NotContains(t, app.DatabaseInitError(), "meta_user")
	require.NotContains(t, app.DatabaseInitError(), "api_key=secret")
}
