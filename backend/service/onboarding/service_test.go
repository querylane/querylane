package onboarding

import (
	"context"
	"os"
	"path/filepath"
	"testing"
	"time"

	"connectrpc.com/connect"
	"github.com/stretchr/testify/assert"
	"github.com/stretchr/testify/require"

	"github.com/querylane/querylane/backend/config"
	serverconfig "github.com/querylane/querylane/backend/config/server"
	"github.com/querylane/querylane/backend/dbsetup"
	"github.com/querylane/querylane/backend/embeddedpg"
	v1alpha1 "github.com/querylane/querylane/backend/protogen/querylane/console/v1alpha1"
)

func Test_resolveSetupPath(t *testing.T) {
	t.Parallel()

	tests := []struct {
		name              string
		msg               *v1alpha1.SetupAppDatabaseRequest
		embeddedAvailable bool
		wantErr           bool
		wantCode          connect.Code
		wantErrContains   string
		validate          func(t *testing.T, path *setupPath)
	}{
		{
			name: "postgres_config",
			msg: &v1alpha1.SetupAppDatabaseRequest{
				Setup: &v1alpha1.SetupAppDatabaseRequest_PostgresConfig{
					PostgresConfig: &v1alpha1.PostgresConfig{
						Host:     "db.example.com",
						Port:     5432,
						Database: "mydb",
						Username: "admin",
						Password: "secret",
						SslMode:  v1alpha1.PostgresConfig_SSL_MODE_REQUIRE,
					},
				},
			},
			embeddedAvailable: true,
			validate: func(t *testing.T, path *setupPath) {
				t.Helper()

				require.NotNil(t, path.dbCfg)
				assert.Equal(t, "db.example.com", path.dbCfg.Host)
				assert.Equal(t, 5432, path.dbCfg.Port)
				assert.Equal(t, "mydb", path.dbCfg.Database)
				assert.Equal(t, "admin", path.dbCfg.Username)
				assert.Equal(t, "secret", path.dbCfg.Password)
				assert.Equal(t, "require", path.dbCfg.SSLMode)

				require.NotNil(t, path.persistCfg)
				assert.Equal(t, path.dbCfg, path.persistCfg.Database)

				assert.Equal(t, []dbsetup.StepID{
					dbsetup.StepConnecting,
					dbsetup.StepMigrating,
					dbsetup.StepInitializingServices,
					dbsetup.StepPersistingConfig,
				}, path.steps)
			},
		},
		{
			name: "postgres_config/ssl_default",
			msg: &v1alpha1.SetupAppDatabaseRequest{
				Setup: &v1alpha1.SetupAppDatabaseRequest_PostgresConfig{
					PostgresConfig: &v1alpha1.PostgresConfig{
						Host:     "localhost",
						Port:     5432,
						Database: "test",
						Username: "user",
						SslMode:  v1alpha1.PostgresConfig_SSL_MODE_UNSPECIFIED,
					},
				},
			},
			embeddedAvailable: false,
			validate: func(t *testing.T, path *setupPath) {
				t.Helper()

				require.NotNil(t, path.dbCfg)
				assert.Equal(t, "prefer", path.dbCfg.SSLMode)
			},
		},
		{
			name: "embedded_config/available",
			msg: &v1alpha1.SetupAppDatabaseRequest{
				Setup: &v1alpha1.SetupAppDatabaseRequest_EmbeddedConfig{
					EmbeddedConfig: &v1alpha1.EmbeddedSetupConfig{
						Port: 9999,
						Mode: "ephemeral",
					},
				},
			},
			embeddedAvailable: true,
			validate: func(t *testing.T, path *setupPath) {
				t.Helper()

				assert.Nil(t, path.dbCfg, "dbCfg should be nil for embedded setup (derived after Start)")

				require.NotNil(t, path.persistCfg)
				require.NotNil(t, path.persistCfg.Embedded)
				assert.Equal(t, 9999, path.persistCfg.Embedded.Port)
				assert.Equal(t, "ephemeral", path.persistCfg.Embedded.Mode)
				assert.Nil(t, path.persistCfg.Database)

				assert.Equal(t, []dbsetup.StepID{
					dbsetup.StepStartingEmbedded,
					dbsetup.StepConnecting,
					dbsetup.StepMigrating,
					dbsetup.StepInitializingServices,
					dbsetup.StepPersistingConfig,
				}, path.steps)
			},
		},
		{
			name: "embedded_config/unavailable",
			msg: &v1alpha1.SetupAppDatabaseRequest{
				Setup: &v1alpha1.SetupAppDatabaseRequest_EmbeddedConfig{
					EmbeddedConfig: &v1alpha1.EmbeddedSetupConfig{},
				},
			},
			embeddedAvailable: false,
			wantErr:           true,
			wantCode:          connect.CodeFailedPrecondition,
			wantErrContains:   "not available",
		},
		{
			name:              "no_setup_specified",
			msg:               &v1alpha1.SetupAppDatabaseRequest{},
			embeddedAvailable: true,
			wantErr:           true,
			wantCode:          connect.CodeInvalidArgument,
			wantErrContains:   "must specify",
		},
	}

	for _, tt := range tests {
		t.Run(tt.name, func(t *testing.T) {
			t.Parallel()

			path, err := resolveSetupPath(tt.msg, tt.embeddedAvailable)

			if tt.wantErr {
				require.Error(t, err)

				var connectErr *connect.Error
				require.ErrorAs(t, err, &connectErr)
				assert.Equal(t, tt.wantCode, connectErr.Code())
				assert.Contains(t, connectErr.Message(), tt.wantErrContains)

				return
			}

			require.NoError(t, err)
			require.NotNil(t, path)
			tt.validate(t, path)
		})
	}
}

func Test_buildEmbeddedPersistConfig(t *testing.T) {
	t.Parallel()

	tests := []struct {
		name     string
		input    *v1alpha1.EmbeddedSetupConfig
		validate func(t *testing.T, cfg *serverconfig.Config)
	}{
		{
			name:  "defaults",
			input: &v1alpha1.EmbeddedSetupConfig{},
			validate: func(t *testing.T, cfg *serverconfig.Config) {
				t.Helper()

				require.NotNil(t, cfg.Embedded)
				assert.Equal(t, "persistent", cfg.Embedded.Mode)
				assert.Equal(t, 5433, cfg.Embedded.Port)
				assert.Nil(t, cfg.Database)
			},
		},
		{
			name:  "custom_port",
			input: &v1alpha1.EmbeddedSetupConfig{Port: 7777},
			validate: func(t *testing.T, cfg *serverconfig.Config) {
				t.Helper()

				require.NotNil(t, cfg.Embedded)
				assert.Equal(t, 7777, cfg.Embedded.Port)
				assert.Equal(t, "persistent", cfg.Embedded.Mode)
			},
		},
		{
			name:  "custom_mode",
			input: &v1alpha1.EmbeddedSetupConfig{Mode: "ephemeral"},
			validate: func(t *testing.T, cfg *serverconfig.Config) {
				t.Helper()

				require.NotNil(t, cfg.Embedded)
				assert.Equal(t, "ephemeral", cfg.Embedded.Mode)
				assert.Equal(t, 5433, cfg.Embedded.Port)
			},
		},
		{
			name:  "all_custom",
			input: &v1alpha1.EmbeddedSetupConfig{Port: 8888, Mode: "ephemeral"},
			validate: func(t *testing.T, cfg *serverconfig.Config) {
				t.Helper()

				require.NotNil(t, cfg.Embedded)
				assert.Equal(t, 8888, cfg.Embedded.Port)
				assert.Equal(t, "ephemeral", cfg.Embedded.Mode)
			},
		},
	}

	for _, tt := range tests {
		t.Run(tt.name, func(t *testing.T) {
			t.Parallel()

			cfg := buildEmbeddedPersistConfig(tt.input)
			require.NotNil(t, cfg)
			tt.validate(t, cfg)
		})
	}
}

func TestService_startEmbeddedConfiguresManagerFromRequest(t *testing.T) {
	t.Parallel()

	if !testing.Short() {
		t.Skip("unit test: run with -short")
	}

	tests := []struct {
		name          string
		cfg           *serverconfig.EmbeddedDatabase
		wantMode      embeddedpg.Mode
		wantDataPath  string
		wantPort      int
		wantHealthInt time.Duration
		wantEvents    []dbsetup.ProgressEvent
	}{
		{
			name: "applies request config and emits progress events",
			cfg: &serverconfig.EmbeddedDatabase{
				Mode:                "ephemeral",
				DataPath:            "/requested",
				Port:                7777,
				HealthCheckInterval: 2 * time.Second,
			},
			wantMode:      embeddedpg.ModeEphemeral,
			wantDataPath:  "/requested",
			wantPort:      7777,
			wantHealthInt: 2 * time.Second,
			wantEvents: []dbsetup.ProgressEvent{
				dbsetup.NewEvent(dbsetup.StepStartingEmbedded, dbsetup.StateInProgress),
				dbsetup.NewEvent(dbsetup.StepStartingEmbedded, dbsetup.StateSucceeded),
			},
		},
	}

	for _, tt := range tests {
		t.Run(tt.name, func(t *testing.T) {
			t.Parallel()

			manager := &fakeEmbeddedManager{}
			service := &Service{embeddedManager: manager}
			events := make([]dbsetup.ProgressEvent, 0, 2)

			err := service.startEmbedded(context.Background(), tt.cfg, func(event dbsetup.ProgressEvent) error {
				events = append(events, event)

				return nil
			})

			require.NoError(t, err)
			assert.True(t, manager.started)
			assert.Equal(t, tt.wantMode, manager.configured.Mode)
			assert.Equal(t, tt.wantDataPath, manager.configured.DataPath)
			assert.Equal(t, tt.wantPort, manager.configured.Port)
			assert.Equal(t, tt.wantHealthInt, manager.configured.HealthCheckInterval)
			assert.Equal(t, tt.wantEvents, events)
		})
	}
}

type fakeEmbeddedManager struct {
	configured embeddedpg.Config
	started    bool
}

func (f *fakeEmbeddedManager) StartWithConfig(_ context.Context, cfg embeddedpg.Config) error {
	f.configured = cfg
	f.started = true

	return nil
}

func (f *fakeEmbeddedManager) DatabaseConfig() *serverconfig.Database {
	return &serverconfig.Database{Port: f.configured.Port}
}

func TestWatchConfigChanges(t *testing.T) {
	t.Parallel()

	if !testing.Short() {
		t.Skip("unit test: run with -short")
	}

	const postgresDSN = "postgres://user:pass@localhost:5432/querylane?sslmode=disable"

	tests := []struct {
		name       string
		configYAML string
		run        func(t *testing.T, cfgMgr *config.Manager[*serverconfig.Config], init *fakeDatabaseInitializer, recorder *watchRecorder)
	}{
		{
			name: "detects already saved database config",
			configYAML: `database:
  dsn: "postgres://user:pass@localhost:5432/querylane?sslmode=disable"
`,
			run: func(t *testing.T, _ *config.Manager[*serverconfig.Config], init *fakeDatabaseInitializer, recorder *watchRecorder) {
				t.Helper()

				recorder.waitForEvent(t, dbsetup.StepConfigDetected, dbsetup.StateSucceeded)
				assertEventsContainInOrder(t, recorder.events, []dbsetup.ProgressEvent{
					dbsetup.NewEvent(dbsetup.StepWaitingForConfig, dbsetup.StatePending),
					dbsetup.NewEvent(dbsetup.StepConfigDetected, dbsetup.StatePending),
					dbsetup.NewEvent(dbsetup.StepWaitingForConfig, dbsetup.StateInProgress),
					dbsetup.NewEvent(dbsetup.StepWaitingForConfig, dbsetup.StateSucceeded),
					dbsetup.NewEvent(dbsetup.StepConfigDetected, dbsetup.StateSucceeded),
				})

				init.ProgressBroadcaster().Send(dbsetup.NewEvent(dbsetup.StepInitializingServices, dbsetup.StateSucceeded))
				require.NoError(t, <-recorder.done)
			},
		},
		{
			name: "detects already saved embedded config",
			configYAML: `embedded:
  port: 5433
  mode: persistent
  data_path: /tmp/querylane-test-pgdata
  health_check_interval: 10s
`,
			run: func(t *testing.T, _ *config.Manager[*serverconfig.Config], init *fakeDatabaseInitializer, recorder *watchRecorder) {
				t.Helper()

				recorder.waitForEvent(t, dbsetup.StepConfigDetected, dbsetup.StateSucceeded)
				assertEventsContainInOrder(t, recorder.events, []dbsetup.ProgressEvent{
					dbsetup.NewEvent(dbsetup.StepWaitingForConfig, dbsetup.StateInProgress),
					dbsetup.NewEvent(dbsetup.StepWaitingForConfig, dbsetup.StateSucceeded),
					dbsetup.NewEvent(dbsetup.StepConfigDetected, dbsetup.StateSucceeded),
				})

				init.ProgressBroadcaster().Send(dbsetup.NewEvent(dbsetup.StepInitializingServices, dbsetup.StateSucceeded))
				require.NoError(t, <-recorder.done)
			},
		},
		{
			name: "detects future config change once",
			configYAML: `http:
  host: "0.0.0.0"
  port: 8080
`,
			run: func(t *testing.T, cfgMgr *config.Manager[*serverconfig.Config], init *fakeDatabaseInitializer, recorder *watchRecorder) {
				t.Helper()

				recorder.waitForEvent(t, dbsetup.StepWaitingForConfig, dbsetup.StateInProgress)

				currentCfg := cfgMgr.CurrentConfig()
				require.NoError(t, cfgMgr.UpdateConfig(&serverconfig.Config{
					HTTP:     currentCfg.HTTP,
					Database: &serverconfig.Database{DSN: postgresDSN},
				}))
				recorder.waitForEvent(t, dbsetup.StepConfigDetected, dbsetup.StateSucceeded)

				reloadedCfg := cfgMgr.CurrentConfig()
				require.NoError(t, cfgMgr.UpdateConfig(&serverconfig.Config{
					HTTP:     reloadedCfg.HTTP,
					Database: &serverconfig.Database{DSN: postgresDSN},
				}))
				init.ProgressBroadcaster().Send(dbsetup.NewEvent(dbsetup.StepInitializingServices, dbsetup.StateSucceeded))
				require.NoError(t, <-recorder.done)
				recorder.drain()

				assert.Equal(t, 1, countEvents(recorder.events, dbsetup.StepConfigDetected, dbsetup.StateSucceeded))
			},
		},
	}

	for _, tt := range tests {
		t.Run(tt.name, func(t *testing.T) {
			t.Parallel()

			cfgMgr := newTestConfigManager(t, tt.configYAML)
			init := newFakeDatabaseInitializer()
			svc := NewService(cfgMgr, init, nil)

			recorder, stop := startWatchConfigChanges(t, svc)
			defer stop()

			tt.run(t, cfgMgr, init, recorder)
		})
	}
}

func TestWatchConfigChangesCompletesWhenTerminalEventFillsBuffer(t *testing.T) {
	t.Parallel()

	if !testing.Short() {
		t.Skip("unit test: run with -short")
	}

	cfgMgr := newTestConfigManager(t, `database:
  dsn: "postgres://user:pass@localhost:5432/querylane?sslmode=disable"
`)
	init := newFakeDatabaseInitializer()
	svc := NewService(cfgMgr, init, nil)

	ctx, cancel := context.WithCancel(t.Context())
	defer cancel()

	configDetected := make(chan struct{})
	releaseStream := make(chan struct{})
	done := make(chan error, 1)

	go func() {
		done <- svc.watchConfigChanges(ctx, func(event dbsetup.ProgressEvent) error {
			if event.StepID == dbsetup.StepConfigDetected && event.State == dbsetup.StateSucceeded {
				close(configDetected)
				<-releaseStream
			}

			return nil
		})
	}()

	require.Eventually(t, func() bool {
		select {
		case <-configDetected:
			return true
		default:
			return false
		}
	}, time.Second, 10*time.Millisecond)

	for range progressEventBufferCapacity {
		init.ProgressBroadcaster().Send(dbsetup.NewEvent(dbsetup.StepConnecting, dbsetup.StateInProgress))
	}

	init.ProgressBroadcaster().Send(dbsetup.NewEvent(dbsetup.StepInitializingServices, dbsetup.StateSucceeded))
	close(releaseStream)

	var watchErr error

	require.Eventually(t, func() bool {
		select {
		case watchErr = <-done:
			return true
		default:
			return false
		}
	}, time.Second, 10*time.Millisecond, "watch should complete after initialization succeeds")
	require.NoError(t, watchErr)
}

// TestSetupAppDatabasePersistsConfigWhenClientDisconnects is the regression
// guard for the disconnect-during-setup bug: the route swap inside
// InitializeDatabaseWithConfig happens before initialization completes, so the
// frontend often navigates away (cancelling the stream context) right then.
// The database is then initialized, the wizard refuses to re-run
// (FailedPrecondition), but config.yaml was never written — a restart drops
// back to onboarding. Once init has started, the config must be persisted
// even if the stream context is cancelled.
func TestSetupAppDatabasePersistsConfigWhenClientDisconnects(t *testing.T) {
	t.Parallel()

	if !testing.Short() {
		t.Skip("unit test: run with -short")
	}

	cfgMgr := newTestConfigManager(t, "")
	init := newBlockingDatabaseInitializer()
	svc := NewService(cfgMgr, init, nil)

	ctx, cancel := context.WithCancel(t.Context())
	defer cancel()

	msg := &v1alpha1.SetupAppDatabaseRequest{
		Setup: &v1alpha1.SetupAppDatabaseRequest_PostgresConfig{
			PostgresConfig: &v1alpha1.PostgresConfig{
				Host:     "db.example.com",
				Port:     5432,
				Database: "querylane",
				Username: "admin",
				Password: "secret",
				SslMode:  v1alpha1.PostgresConfig_SSL_MODE_DISABLED,
			},
		},
	}

	done := make(chan error, 1)

	go func() {
		done <- svc.setupAppDatabase(ctx, msg, func(dbsetup.ProgressEvent) error { return nil })
	}()

	// Wait until initialization is in flight, then simulate the client
	// disconnect (stream context cancelled) and let init finish successfully.
	select {
	case <-init.started:
	case <-time.After(5 * time.Second):
		t.Fatal("initialization never started")
	}

	cancel()
	close(init.release)

	select {
	case err := <-done:
		require.ErrorIs(t, err, context.Canceled)
	case <-time.After(5 * time.Second):
		t.Fatal("setupAppDatabase did not return after disconnect")
	}

	require.NoError(t, init.ctxErrAfterCancel,
		"init must run on a context detached from the stream so a disconnect cannot abort it halfway")

	require.True(t, cfgMgr.ConfigPersisted(),
		"config must be persisted after init started, even if the client disconnected")

	persisted := cfgMgr.CurrentConfig()
	require.NotNil(t, persisted.Database)
	assert.Equal(t, "db.example.com", persisted.Database.Host)
	assert.Equal(t, "admin", persisted.Database.Username)
}

// TestPersistConfigPreservesExistingHTTPConfig is the regression guard for
// the config-clobbering bug: persisting the onboarding result must not
// replace pre-existing http/CORS/access_log customization with baked-in
// defaults — only the database/embedded section is being configured.
func TestPersistConfigPreservesExistingHTTPConfig(t *testing.T) {
	t.Parallel()

	if !testing.Short() {
		t.Skip("unit test: run with -short")
	}

	cfgMgr := newTestConfigManager(t, `http:
  host: "127.0.0.1"
  port: 9191
  access_log: false
  cors:
    allowed_origins:
      - "https://example.com"
`)
	svc := NewService(cfgMgr, newFakeDatabaseInitializer(), nil)

	noopSend := func(dbsetup.ProgressEvent) error { return nil }
	persistCfg := &serverconfig.Config{
		Database: &serverconfig.Database{DSN: "postgres://user:pass@localhost:5432/querylane?sslmode=disable"},
	}

	require.NoError(t, svc.persistConfig(persistCfg, noopSend))

	persisted := cfgMgr.CurrentConfig()
	require.NotNil(t, persisted.Database, "new database section must be persisted")
	assert.Contains(t, persisted.Database.DSN, "querylane")

	assert.Equal(t, "127.0.0.1", persisted.HTTP.Host, "custom http host must survive persisting")
	assert.Equal(t, 9191, persisted.HTTP.Port, "custom http port must survive persisting")
	assert.False(t, persisted.HTTP.AccessLogEnabled(), "explicit access_log: false must survive persisting")
	assert.Equal(t, []string{"https://example.com"}, persisted.HTTP.CORS.AllowedOrigins,
		"custom CORS origins must survive persisting")

	// The file on disk must carry the customization too, so a restart keeps it.
	data, err := os.ReadFile(cfgMgr.ConfigFilePath())
	require.NoError(t, err)

	yamlStr := string(data)
	assert.Contains(t, yamlStr, "access_log: false")
	assert.Contains(t, yamlStr, "https://example.com")
	assert.Contains(t, yamlStr, "port: 9191")
}

// blockingDatabaseInitializer blocks InitializeDatabaseWithConfig until
// release is closed, so tests can interleave a client disconnect with an
// in-flight initialization. ctxErrAfterCancel records the init context's
// error after release — the test cancels the stream context before
// releasing, so a non-nil value means init ran on the cancellable stream
// context instead of a detached one.
type blockingDatabaseInitializer struct {
	broadcaster       *dbsetup.Broadcaster
	started           chan struct{}
	release           chan struct{}
	ctxErrAfterCancel error
}

func newBlockingDatabaseInitializer() *blockingDatabaseInitializer {
	return &blockingDatabaseInitializer{
		broadcaster: dbsetup.NewBroadcaster(),
		started:     make(chan struct{}),
		release:     make(chan struct{}),
	}
}

func (f *blockingDatabaseInitializer) InitializeDatabaseWithConfig(ctx context.Context, _ *serverconfig.Config) error {
	close(f.started)
	<-f.release
	f.ctxErrAfterCancel = ctx.Err()

	return nil
}

func (f *blockingDatabaseInitializer) IsDatabaseInitialized() bool { return false }

func (f *blockingDatabaseInitializer) DatabaseInitError() string { return "" }

func (f *blockingDatabaseInitializer) ProgressBroadcaster() *dbsetup.Broadcaster {
	return f.broadcaster
}

type fakeDatabaseInitializer struct {
	broadcaster *dbsetup.Broadcaster
}

func newFakeDatabaseInitializer() *fakeDatabaseInitializer {
	return &fakeDatabaseInitializer{broadcaster: dbsetup.NewBroadcaster()}
}

func (f *fakeDatabaseInitializer) InitializeDatabaseWithConfig(context.Context, *serverconfig.Config) error {
	return nil
}

func (f *fakeDatabaseInitializer) IsDatabaseInitialized() bool { return false }

func (f *fakeDatabaseInitializer) DatabaseInitError() string { return "" }

func (f *fakeDatabaseInitializer) ProgressBroadcaster() *dbsetup.Broadcaster { return f.broadcaster }

type watchRecorder struct {
	events []dbsetup.ProgressEvent
	ch     chan dbsetup.ProgressEvent
	done   chan error
}

func newTestConfigManager(t *testing.T, yaml string) *config.Manager[*serverconfig.Config] {
	t.Helper()

	configPath := filepath.Join(t.TempDir(), "config.yaml")
	require.NoError(t, os.WriteFile(configPath, []byte(yaml), 0o644))

	cfgMgr, err := config.NewConfigManager(t.Context(), &serverconfig.Config{}, config.WithConfigFile(configPath))
	require.NoError(t, err)

	return cfgMgr
}

func startWatchConfigChanges(t *testing.T, svc *Service) (*watchRecorder, context.CancelFunc) {
	t.Helper()

	ctx, cancel := context.WithCancel(t.Context())
	recorder := &watchRecorder{
		ch:   make(chan dbsetup.ProgressEvent, 16),
		done: make(chan error, 1),
	}

	go func() {
		recorder.done <- svc.watchConfigChanges(ctx, func(e dbsetup.ProgressEvent) error {
			recorder.ch <- e
			return nil
		})
	}()

	return recorder, cancel
}

func (r *watchRecorder) waitForEvent(t *testing.T, step dbsetup.StepID, state dbsetup.StepState) {
	t.Helper()

	require.Eventually(t, func() bool {
		for {
			select {
			case e := <-r.ch:
				r.events = append(r.events, e)
				if e.StepID == step && e.State == state {
					return true
				}
			default:
				return false
			}
		}
	}, time.Second, 10*time.Millisecond)
}

func (r *watchRecorder) drain() {
	for {
		select {
		case e := <-r.ch:
			r.events = append(r.events, e)
		default:
			return
		}
	}
}

func assertEventsContainInOrder(t *testing.T, got []dbsetup.ProgressEvent, want []dbsetup.ProgressEvent) {
	t.Helper()

	matchFrom := 0
	for _, event := range got {
		if event.StepID == want[matchFrom].StepID && event.State == want[matchFrom].State {
			matchFrom++
			if matchFrom == len(want) {
				return
			}
		}
	}

	require.Failf(t, "missing events", "got %#v, want subsequence %#v", got, want)
}

func countEvents(events []dbsetup.ProgressEvent, step dbsetup.StepID, state dbsetup.StepState) int {
	count := 0

	for _, e := range events {
		if e.StepID == step && e.State == state {
			count++
		}
	}

	return count
}
