package server

import (
	"context"
	"errors"
	"fmt"
	"os"
	"path/filepath"
	"testing"
	"time"

	"connectrpc.com/validate"
	"github.com/jackc/pgerrcode"
	"github.com/jackc/pgx/v5/pgconn"
	"github.com/stretchr/testify/require"

	"github.com/querylane/querylane/backend/config"
	serverconfig "github.com/querylane/querylane/backend/config/server"
	"github.com/querylane/querylane/backend/dbsetup"
	"github.com/querylane/querylane/backend/embeddedpg"
)

type fakeEmbeddedEffectiveConfigManager struct {
	databaseConfig *serverconfig.Database
	startCalls     int
	startErr       error
}

func (f *fakeEmbeddedEffectiveConfigManager) StartWithConfig(_ context.Context, _ embeddedpg.Config) error {
	f.startCalls++

	return f.startErr
}

func (f *fakeEmbeddedEffectiveConfigManager) DatabaseConfig() *serverconfig.Database {
	return f.databaseConfig
}

func TestResolveEmbeddedEffectiveConfigReusesAlreadyRunningPostgres(t *testing.T) {
	t.Parallel()

	dbCfg := &serverconfig.Database{
		Host:     "127.0.0.1",
		Port:     5432,
		Database: "querylane",
		Username: "querylane",
		Password: "secret",
		SSLMode:  "disable",
	}
	manager := &fakeEmbeddedEffectiveConfigManager{
		databaseConfig: dbCfg,
		startErr:       embeddedpg.ErrAlreadyRunning,
	}
	cfg := &serverconfig.Config{
		Embedded:  &serverconfig.EmbeddedDatabase{},
		Instances: []*serverconfig.InstanceConfig{{ID: "demo"}},
	}

	resolved, err := resolveEmbeddedEffectiveConfig(t.Context(), cfg, manager)

	require.NoError(t, err)
	require.NotNil(t, resolved)
	require.Same(t, dbCfg, resolved.Database)
	require.Equal(t, cfg.Instances, resolved.Instances)
	require.Equal(t, 1, manager.startCalls)
}

func TestRetryDatabaseInitResolvesEffectiveConfigEachAttempt(t *testing.T) {
	t.Parallel()

	ctx, cancel := context.WithCancel(t.Context())

	cfg := &serverconfig.Config{}
	resolvedCfg := &serverconfig.Config{Database: &serverconfig.Database{}}
	resolveCalls := 0
	buildCalls := 0
	installCalls := 0

	controller := &Controller{
		retryDatabaseInitInterval: time.Millisecond,
		app:                       &App{},
		currentConfigFunc:         func() *serverconfig.Config { return cfg },
		resolveEffectiveConfigFunc: func(_ context.Context, got *serverconfig.Config) (*serverconfig.Config, error) {
			require.Same(t, cfg, got)

			resolveCalls++
			if resolveCalls == 1 {
				return nil, errDatabaseConfigNotPresent
			}

			return resolvedCfg, nil
		},
		buildDatabaseFunc: func(_ context.Context, got *serverconfig.Config, _ *dbsetup.Broadcaster) (*dbState, error) {
			require.Same(t, resolvedCfg, got)

			buildCalls++

			return &dbState{}, nil
		},
		installReadyStateFunc: func(_ context.Context, state *dbState) {
			require.NotNil(t, state)

			installCalls++

			cancel()
		},
	}

	controller.retryDatabaseInit(ctx)

	require.GreaterOrEqual(t, resolveCalls, 2)
	require.Equal(t, 1, buildCalls)
	require.Equal(t, 1, installCalls)
}

func TestRetryDatabaseInitRedactsDatabaseInitErrorBetweenAttempts(t *testing.T) {
	t.Parallel()

	ctx, cancel := context.WithCancel(t.Context())
	defer cancel()

	app := &App{}
	buildCalls := 0
	pgErr := &pgconn.PgError{
		Code:    pgerrcode.InvalidPassword,
		Message: "password for meta_user contains api_key=secret",
	}
	controller := &Controller{
		retryDatabaseInitInterval: time.Millisecond,
		app:                       app,
		currentConfigFunc:         func() *serverconfig.Config { return &serverconfig.Config{} },
		resolveEffectiveConfigFunc: func(_ context.Context, cfg *serverconfig.Config) (*serverconfig.Config, error) {
			return cfg, nil
		},
		buildDatabaseFunc: func(context.Context, *serverconfig.Config, *dbsetup.Broadcaster) (*dbState, error) {
			buildCalls++
			if buildCalls == 1 {
				return nil, fmt.Errorf("initialize database: %w", pgErr)
			}

			require.Contains(t, app.DatabaseInitError(), pgerrcode.InvalidPassword)
			require.NotContains(t, app.DatabaseInitError(), "meta_user")
			require.NotContains(t, app.DatabaseInitError(), "api_key=secret")

			return &dbState{}, nil
		},
		installReadyStateFunc: func(context.Context, *dbState) { cancel() },
	}

	controller.retryDatabaseInit(ctx)

	require.Equal(t, 2, buildCalls)
}

// TestRetryDatabaseInitUsesLatestConfigEachAttempt is the regression guard for
// the degraded-mode recovery bug: the retry loop must re-read the current
// configuration each attempt, not reuse a stale snapshot. A config fixed
// between attempts (as the file watcher would do after a YAML edit) must be
// picked up so the server recovers without a restart.
func TestRetryDatabaseInitUsesLatestConfigEachAttempt(t *testing.T) {
	t.Parallel()

	ctx, cancel := context.WithCancel(t.Context())
	defer cancel()

	staleCfg := &serverconfig.Config{}                                   // unusable (e.g. wrong password)
	freshCfg := &serverconfig.Config{Database: &serverconfig.Database{}} // corrected config
	resolvedCfg := &serverconfig.Config{Database: &serverconfig.Database{}}

	// First read returns the stale config, every read after returns the fresh
	// one — mimicking the watcher swapping in a corrected config.
	configReads := 0
	buildCalls := 0
	installCalls := 0

	controller := &Controller{
		retryDatabaseInitInterval: time.Millisecond,
		app:                       &App{},
		currentConfigFunc: func() *serverconfig.Config {
			configReads++
			if configReads == 1 {
				return staleCfg
			}

			return freshCfg
		},
		resolveEffectiveConfigFunc: func(_ context.Context, got *serverconfig.Config) (*serverconfig.Config, error) {
			if got == staleCfg {
				return nil, errDatabaseConfigNotPresent // still unusable
			}

			require.Same(t, freshCfg, got, "loop must resolve the corrected config, not a boot snapshot")

			return resolvedCfg, nil
		},
		buildDatabaseFunc: func(_ context.Context, got *serverconfig.Config, _ *dbsetup.Broadcaster) (*dbState, error) {
			require.Same(t, resolvedCfg, got)

			buildCalls++

			return &dbState{}, nil
		},
		installReadyStateFunc: func(_ context.Context, state *dbState) {
			require.NotNil(t, state)

			installCalls++

			cancel()
		},
	}

	controller.retryDatabaseInit(ctx)

	require.GreaterOrEqual(t, configReads, 2, "config must be re-read each attempt")
	require.Equal(t, 1, buildCalls)
	require.Equal(t, 1, installCalls)
}

func TestRetryDatabaseInitRecoversAfterUnsupportedEmbeddedConfigIsEdited(t *testing.T) {
	t.Parallel()

	const unavailableReason = "Embedded PostgreSQL is unavailable in this Querylane image."

	ctx, cancel := context.WithTimeout(t.Context(), 5*time.Second)
	defer cancel()

	embeddedCfg := &serverconfig.Config{Embedded: &serverconfig.EmbeddedDatabase{}}
	externalCfg := &serverconfig.Config{Database: &serverconfig.Database{}}
	configReads := 0
	buildCalls := 0
	installCalls := 0
	errorBeforeRecovery := ""
	configPath := filepath.Join(t.TempDir(), "config.yaml")
	require.NoError(t, os.WriteFile(configPath, nil, 0o600))
	configManager, err := config.NewConfigManager(
		t.Context(),
		&serverconfig.Config{},
		config.WithConfigFile(configPath),
	)
	require.NoError(t, err)
	t.Cleanup(configManager.Stop)
	app := NewApp(
		configManager,
		validate.NewInterceptor(),
		nil,
		unavailableReason,
		dbsetup.NewBroadcaster(),
		nil,
	)
	controller := &Controller{
		embeddedManagerUnavailableError: errors.New(unavailableReason),
		retryDatabaseInitInterval:       time.Millisecond,
		app:                             app,
		delegatingHandler:               &DelegatingHandler{},
		currentConfigFunc: func() *serverconfig.Config {
			configReads++
			if configReads == 1 {
				return embeddedCfg
			}

			return externalCfg
		},
		buildDatabaseFunc: func(_ context.Context, got *serverconfig.Config, _ *dbsetup.Broadcaster) (*dbState, error) {
			require.Same(t, externalCfg, got)

			buildCalls++

			return &dbState{}, nil
		},
		installReadyStateFunc: func(_ context.Context, state *dbState) {
			require.NotNil(t, state)

			errorBeforeRecovery = app.DatabaseInitError()
			app.setState(state)
			app.clearDatabaseInitError()

			installCalls++

			cancel()
		},
	}

	controller.retryDatabaseInit(ctx)

	require.GreaterOrEqual(t, configReads, 2)
	require.Equal(t, 1, buildCalls)
	require.Equal(t, 1, installCalls)
	require.Equal(t, unavailableReason, errorBeforeRecovery)
	require.Empty(t, app.DatabaseInitError())
}

// TestRetryDatabaseInitStopsWhenStateAlreadyInstalled is the regression guard
// for the degraded-mode double-init bug: in degraded mode the onboarding
// wizard can install dbState while the retry loop is still running. Once state
// exists the retry loop must stop instead of building and installing a second
// dbState — the loser of that race would leak its runner goroutines and
// meta-DB pool, and serving could flip to the wrong database.
func TestRetryDatabaseInitStopsWhenStateAlreadyInstalled(t *testing.T) {
	t.Parallel()

	ctx, cancel := context.WithTimeout(t.Context(), 5*time.Second)
	defer cancel()

	app := &App{}
	app.setState(&dbState{})

	resolveCalls := 0
	buildCalls := 0
	installCalls := 0

	controller := &Controller{
		retryDatabaseInitInterval: time.Millisecond,
		app:                       app,
		currentConfigFunc:         func() *serverconfig.Config { return &serverconfig.Config{} },
		resolveEffectiveConfigFunc: func(_ context.Context, cfg *serverconfig.Config) (*serverconfig.Config, error) {
			resolveCalls++

			return cfg, nil
		},
		buildDatabaseFunc: func(_ context.Context, _ *serverconfig.Config, _ *dbsetup.Broadcaster) (*dbState, error) {
			buildCalls++

			return &dbState{}, nil
		},
		installReadyStateFunc: func(_ context.Context, _ *dbState) {
			installCalls++
		},
	}

	controller.retryDatabaseInit(ctx)

	require.NoError(t, ctx.Err(), "retry loop must exit on its own once state is installed, not wait for the context")
	require.Zero(t, resolveCalls, "no config resolution once state is installed")
	require.Zero(t, buildCalls, "no database build once state is installed")
	require.Zero(t, installCalls, "no second install once state is installed")
}

// TestRetryDatabaseInitClosesStateWhenInstalledDuringBuild covers the narrower
// race: the wizard installs state while the retry loop's buildDatabase call is
// already in flight. The freshly built (losing) state must be closed, not
// installed over the wizard's state.
func TestRetryDatabaseInitClosesStateWhenInstalledDuringBuild(t *testing.T) {
	t.Parallel()

	ctx, cancel := context.WithTimeout(t.Context(), 5*time.Second)
	defer cancel()

	app := &App{}
	wizardState := &dbState{}

	retryDB := newStubDB()
	installCalls := 0

	controller := &Controller{
		retryDatabaseInitInterval: time.Millisecond,
		app:                       app,
		currentConfigFunc:         func() *serverconfig.Config { return &serverconfig.Config{} },
		resolveEffectiveConfigFunc: func(_ context.Context, cfg *serverconfig.Config) (*serverconfig.Config, error) {
			return cfg, nil
		},
		buildDatabaseFunc: func(_ context.Context, _ *serverconfig.Config, _ *dbsetup.Broadcaster) (*dbState, error) {
			// The wizard wins the race while this build is in flight.
			app.setState(wizardState)

			return &dbState{postgresCl: retryDB}, nil
		},
		installReadyStateFunc: func(_ context.Context, _ *dbState) {
			installCalls++
		},
	}

	controller.retryDatabaseInit(ctx)

	require.NoError(t, ctx.Err(), "retry loop must exit once it loses the install race")
	require.Zero(t, installCalls, "losing state must not be installed")
	requireDBClosed(t, retryDB)
	require.Same(t, wizardState, app.state.Load())
}
