package embeddedpg

import (
	"io"
	"testing"
	"time"

	"github.com/stretchr/testify/assert"
	"github.com/stretchr/testify/require"

	serverconfig "github.com/querylane/querylane/backend/config/server"
)

func TestNewManager(t *testing.T) {
	t.Parallel()

	t.Run("applies defaults", func(t *testing.T) {
		t.Parallel()

		mgr := NewManager(Config{})
		assert.Equal(t, ModePersistent, mgr.cfg.Mode)
		assert.Equal(t, 5433, mgr.cfg.Port)
		assert.Equal(t, 10*time.Second, mgr.cfg.HealthCheckInterval)
		assert.NotEmpty(t, mgr.cfg.DataPath)
	})

	t.Run("preserves explicit config", func(t *testing.T) {
		t.Parallel()

		mgr := NewManager(Config{
			Mode:                ModeEphemeral,
			DataPath:            "/custom",
			Port:                9876,
			HealthCheckInterval: 30 * time.Second,
		})
		assert.Equal(t, ModeEphemeral, mgr.cfg.Mode)
		assert.Equal(t, "/custom", mgr.cfg.DataPath)
		assert.Equal(t, 9876, mgr.cfg.Port)
		assert.Equal(t, 30*time.Second, mgr.cfg.HealthCheckInterval)
	})
}

func TestManager_Health_InitialState(t *testing.T) {
	t.Parallel()

	mgr := NewManager(Config{})
	assert.Equal(t, HealthUnknown, mgr.Health())
}

func TestManager_DatabaseConfig(t *testing.T) {
	t.Parallel()

	mgr := NewManager(Config{Port: 5555})
	dbCfg := mgr.DatabaseConfig()

	require.NotNil(t, dbCfg)
	assert.Equal(t, "127.0.0.1", dbCfg.Host)
	assert.Equal(t, 5555, dbCfg.Port)
	assert.Equal(t, "querylane", dbCfg.Database)
	assert.Equal(t, "querylane", dbCfg.Username)
	assert.Equal(t, "querylane-embedded", dbCfg.Password)
	assert.Equal(t, "disable", dbCfg.SSLMode)
}

func TestManager_ConfigLifecycle(t *testing.T) {
	t.Parallel()

	tests := []struct {
		name string
		run  func(t *testing.T)
	}{
		{
			name: "configure applies config before start",
			run: func(t *testing.T) {
				t.Helper()

				mgr := NewManager(Config{})

				require.NoError(t, mgr.Configure(Config{
					Mode:                ModeEphemeral,
					DataPath:            "/configured",
					Port:                7777,
					HealthCheckInterval: 2 * time.Second,
				}))

				assert.Equal(t, ModeEphemeral, mgr.cfg.Mode)
				assert.Equal(t, "/configured", mgr.cfg.DataPath)
				assert.Equal(t, 7777, mgr.DatabaseConfig().Port)
				assert.Equal(t, 2*time.Second, mgr.cfg.HealthCheckInterval)
			},
		},
		{
			name: "start with config rejects started without changing config",
			run: func(t *testing.T) {
				t.Helper()

				mgr := NewManager(Config{Port: 5433})
				mgr.started = true

				err := mgr.StartWithConfig(t.Context(), Config{Port: 7777})
				require.Error(t, err)
				assert.Contains(t, err.Error(), "already running")
				assert.Equal(t, 5433, mgr.DatabaseConfig().Port)
			},
		},
		{
			name: "configure rejects started",
			run: func(t *testing.T) {
				t.Helper()

				mgr := NewManager(Config{})
				mgr.started = true

				err := mgr.Configure(Config{Port: 7777})
				require.Error(t, err)
				assert.Contains(t, err.Error(), "after start")
			},
		},
		{
			name: "config from server config maps fields",
			run: func(t *testing.T) {
				t.Helper()

				cfg := ConfigFromServerConfig(&serverconfig.EmbeddedDatabase{
					Mode:                "ephemeral",
					DataPath:            "/server-configured",
					Port:                6543,
					HealthCheckInterval: 3 * time.Second,
				})

				assert.Equal(t, ModeEphemeral, cfg.Mode)
				assert.Equal(t, "/server-configured", cfg.DataPath)
				assert.Equal(t, 6543, cfg.Port)
				assert.Equal(t, 3*time.Second, cfg.HealthCheckInterval)
			},
		},
	}

	for _, tt := range tests {
		t.Run(tt.name, func(t *testing.T) {
			t.Parallel()
			tt.run(t)
		})
	}
}

func TestManager_Logs_Empty(t *testing.T) {
	t.Parallel()

	mgr := NewManager(Config{})
	assert.Empty(t, mgr.Logs())
}

// TestManager_Logs_ConcurrentWithLibraryWrites simulates the embedded-postgres
// library writing process logs from its own goroutine while Logs() is read
// concurrently. Must be race-free under `go test -race`.
func TestManager_Logs_ConcurrentWithLibraryWrites(t *testing.T) {
	t.Parallel()

	mgr := NewManager(Config{})

	// The library only sees the buffer as an io.Writer (via Logger(...)).
	var w io.Writer = mgr.logBuffer

	done := make(chan struct{})

	go func() {
		defer close(done)

		for range 1000 {
			_, err := w.Write([]byte("postgres: log line\n"))
			assert.NoError(t, err)
		}
	}()

	for range 1000 {
		_ = mgr.Logs()
	}

	<-done

	assert.Contains(t, mgr.Logs(), "postgres: log line")
}

func TestManager_Stop_WhenNotStarted(t *testing.T) {
	t.Parallel()

	mgr := NewManager(Config{})
	// Stopping a manager that was never started should be a no-op.
	require.NoError(t, mgr.Stop(t.Context()))
}

func TestManager_Stop_Adopted(t *testing.T) {
	t.Parallel()

	mgr := NewManager(Config{})
	// Simulate an adopted state: started=true, adopted=true, adoptedPID=own PID.
	// We use our own PID which is guaranteed alive, but Stop will call
	// killProcess on it. To avoid killing ourselves, we use a PID that's dead.
	mgr.started = true
	mgr.adopted = true
	mgr.adoptedPID = 2147483647 // extremely unlikely to be alive

	// Stop should attempt to kill the adopted PID and get an error since the
	// process doesn't exist.
	err := mgr.Stop(t.Context())
	require.Error(t, err)
	assert.Contains(t, err.Error(), "kill adopted postgres")

	// Verify that a non-adopted manager with started=false is a no-op.
	mgr2 := NewManager(Config{})
	require.NoError(t, mgr2.Stop(t.Context()))
}

func TestHealthStatus_String(t *testing.T) {
	t.Parallel()

	tests := []struct {
		status   HealthStatus
		expected string
	}{
		{HealthUnknown, "unknown"},
		{HealthHealthy, "healthy"},
		{HealthDegraded, "degraded"},
		{HealthStopped, "stopped"},
		{HealthStatus(99), "invalid"},
	}

	for _, tt := range tests {
		t.Run(tt.expected, func(t *testing.T) {
			t.Parallel()
			assert.Equal(t, tt.expected, tt.status.String())
		})
	}
}
