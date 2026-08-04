package server

import (
	"context"
	"database/sql"
	"database/sql/driver"
	"errors"
	"net/http"
	"net/http/httptest"
	"testing"

	"connectrpc.com/validate"
	"github.com/stretchr/testify/assert"
	"github.com/stretchr/testify/require"

	"github.com/querylane/querylane/backend/config"
	"github.com/querylane/querylane/backend/dbsetup"
)

type healthyPingConnector struct{}

func (healthyPingConnector) Connect(context.Context) (driver.Conn, error) {
	return healthyPingConn{}, nil
}

func (healthyPingConnector) Driver() driver.Driver { return stubDriver{} }

type healthyPingConn struct{}

func (healthyPingConn) Prepare(string) (driver.Stmt, error) {
	return nil, errors.New("not supported")
}

func (healthyPingConn) Close() error { return nil }

func (healthyPingConn) Begin() (driver.Tx, error) {
	return nil, errors.New("not supported")
}

func (healthyPingConn) Ping(context.Context) error { return nil }

func newHealthTestApp(t *testing.T) *App {
	t.Helper()

	cfgMgr, err := config.NewConfigManager(t.Context(), defaultConfig())
	require.NoError(t, err)
	t.Cleanup(cfgMgr.Stop)

	return NewApp(
		cfgMgr,
		validate.NewInterceptor(),
		nil,
		dbsetup.NewBroadcaster(),
		nil,
	)
}

func healthHandler(app *App) http.Handler {
	mux := http.NewServeMux()
	app.mountHealthRoutes(mux)

	return mux
}

func TestAppHealthEndpointsBeforeDatabaseInitialization(t *testing.T) {
	t.Parallel()

	if !testing.Short() {
		t.Skip("unit test: run with -short")
	}

	app := newHealthTestApp(t)
	handler := healthHandler(app)

	t.Run("liveness reports a running server", func(t *testing.T) {
		t.Parallel()

		request := httptest.NewRequest(http.MethodGet, "/livez", nil)
		response := httptest.NewRecorder()

		handler.ServeHTTP(response, request)

		assert.Equal(t, http.StatusOK, response.Code)
		assert.Equal(t, "ok\n", response.Body.String())
	})

	t.Run("readiness rejects an uninitialized database", func(t *testing.T) {
		t.Parallel()

		request := httptest.NewRequest(http.MethodGet, "/readyz", nil)
		response := httptest.NewRecorder()

		handler.ServeHTTP(response, request)

		assert.Equal(t, http.StatusServiceUnavailable, response.Code)
		assert.Equal(t, "not ready\n", response.Body.String())
	})
}

func TestAppReadinessTracksMetaDatabaseAvailability(t *testing.T) {
	t.Parallel()

	if !testing.Short() {
		t.Skip("unit test: run with -short")
	}

	t.Run("ready", func(t *testing.T) {
		t.Parallel()

		db := sql.OpenDB(healthyPingConnector{})
		app := newHealthTestApp(t)
		app.setState(&dbState{postgresCl: db, metaDBGate: newMetaDBGate(db)})
		t.Cleanup(app.Close)

		request := httptest.NewRequest(http.MethodGet, "/readyz", nil)
		response := httptest.NewRecorder()

		healthHandler(app).ServeHTTP(response, request)

		assert.Equal(t, http.StatusOK, response.Code)
		assert.Equal(t, "ok\n", response.Body.String())
	})

	t.Run("unavailable", func(t *testing.T) {
		t.Parallel()

		db := sql.OpenDB(metaDBErrorConnector{err: errors.New("database unavailable")})
		app := newHealthTestApp(t)
		app.setState(&dbState{postgresCl: db, metaDBGate: newMetaDBGate(db)})
		t.Cleanup(app.Close)

		request := httptest.NewRequest(http.MethodGet, "/readyz", nil)
		response := httptest.NewRecorder()

		healthHandler(app).ServeHTTP(response, request)

		assert.Equal(t, http.StatusServiceUnavailable, response.Code)
		assert.Equal(t, "not ready\n", response.Body.String())
	})
}
