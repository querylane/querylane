// Package onboarding implements the OnboardingService, which guides users
// through configuring the application's metadata database.
package onboarding

import (
	"context"
	"errors"
	"fmt"
	"log/slog"
	"path/filepath"

	"connectrpc.com/connect"

	"github.com/querylane/querylane/backend/config"
	serverconfig "github.com/querylane/querylane/backend/config/server"
	"github.com/querylane/querylane/backend/dbsetup"
	"github.com/querylane/querylane/backend/embeddedpg"
	v1alpha1 "github.com/querylane/querylane/backend/protogen/querylane/console/v1alpha1"
	v1connect "github.com/querylane/querylane/backend/protogen/querylane/console/v1alpha1/consolev1alpha1connect"
	"github.com/querylane/querylane/backend/service/internal/pgconv"
)

const (
	progressEventBufferCapacity = 32
	homeNotWritableReason       = "Querylane cannot save setup because its home directory is not writable."
	embeddedUnavailableReason   = "Embedded PostgreSQL is not available in this environment."
)

// DatabaseInitializer is used by the OnboardingService to trigger database
// initialization and observe progress.
type DatabaseInitializer interface {
	InitializeDatabaseWithConfig(ctx context.Context, cfg *serverconfig.Config) error
	IsDatabaseInitialized() bool
	DatabaseInitError() string
	ProgressBroadcaster() *dbsetup.Broadcaster
}

// EmbeddedManager is the subset of embeddedpg.Manager needed by this service.
type EmbeddedManager interface {
	StartWithConfig(ctx context.Context, cfg embeddedpg.Config) error
	DatabaseConfig() *serverconfig.Database
}

// Ensure Service implements the OnboardingServiceHandler interface at compile time.
var _ v1connect.OnboardingServiceHandler = (*Service)(nil)

// Service implements the OnboardingService RPCs.
type Service struct {
	configManager   *config.Manager[*serverconfig.Config]
	dbInitializer   DatabaseInitializer
	embeddedManager EmbeddedManager // nil if unavailable
	embeddedReason  string
}

// NewService creates a new onboarding service. embeddedMgr may be nil.
func NewService(
	cfgMgr *config.Manager[*serverconfig.Config],
	dbInit DatabaseInitializer,
	embeddedMgr *embeddedpg.Manager,
	embeddedReason string,
) *Service {
	s := &Service{
		configManager:  cfgMgr,
		dbInitializer:  dbInit,
		embeddedReason: embeddedReason,
	}
	if embeddedMgr != nil {
		s.embeddedManager = embeddedMgr
	}

	return s
}

// GetOnboardingState returns the current onboarding state.
func (s *Service) GetOnboardingState(
	_ context.Context,
	_ *connect.Request[v1alpha1.GetOnboardingStateRequest],
) (*connect.Response[v1alpha1.GetOnboardingStateResponse], error) {
	cfg := s.configManager.CurrentConfig()
	homePath := s.configManager.StandardHomePath()
	isWritable := s.configManager.CanWriteConfig()

	methodAvailabilities := s.setupMethodAvailabilities(isWritable)
	methods := availableSetupMethods(methodAvailabilities)

	configFilePath := s.configManager.ConfigFilePath()
	if configFilePath == "" {
		configFilePath = filepath.Join(homePath, "config.yaml")
	}

	res := &v1alpha1.GetOnboardingStateResponse{
		IsConfigured: cfg.Database != nil || cfg.Embedded != nil,
		AppDatabaseStatus: pgconv.DatabaseStatusFromInitializer(
			s.dbInitializer.IsDatabaseInitialized(),
			s.dbInitializer.DatabaseInitError(),
		),
		HomePath:                  homePath,
		IsHomeWritable:            isWritable,
		AvailableMethods:          methods,
		SetupMethodAvailabilities: methodAvailabilities,
		ConfigFilePath:            configFilePath,
		EmbeddedDataPath:          filepath.Join(homePath, "pgdata"),
	}

	return connect.NewResponse(res), nil
}

// SetupAppDatabase configures and initializes the app database, streaming
// progress events to the client.
func (s *Service) SetupAppDatabase(
	ctx context.Context,
	req *connect.Request[v1alpha1.SetupAppDatabaseRequest],
	stream *connect.ServerStream[v1alpha1.SetupAppDatabaseResponse],
) error {
	return s.setupAppDatabase(ctx, req.Msg, func(e dbsetup.ProgressEvent) error {
		return stream.Send(wrapSetupEvent(progressEventToProto(e)))
	})
}

// WatchConfigChanges subscribes to config changes and streams database setup
// progress events triggered by the file watcher or other config updates.
func (s *Service) WatchConfigChanges(
	ctx context.Context,
	_ *connect.Request[v1alpha1.WatchConfigChangesRequest],
	stream *connect.ServerStream[v1alpha1.WatchConfigChangesResponse],
) error {
	if s.dbInitializer.IsDatabaseInitialized() {
		return connect.NewError(connect.CodeFailedPrecondition,
			errors.New("database is already configured"))
	}

	sendEvent := func(e dbsetup.ProgressEvent) error {
		return stream.Send(wrapWatchEvent(progressEventToProto(e)))
	}

	return s.watchConfigChanges(ctx, sendEvent)
}

func (s *Service) setupAppDatabase(
	ctx context.Context,
	msg *v1alpha1.SetupAppDatabaseRequest,
	sendEvent func(dbsetup.ProgressEvent) error,
) error {
	if s.dbInitializer.IsDatabaseInitialized() {
		return connect.NewError(connect.CodeFailedPrecondition,
			errors.New("database is already configured"))
	}

	path, err := resolveSetupPath(msg, s.setupMethodAvailabilities(s.configManager.CanWriteConfig()))
	if err != nil {
		return err
	}

	// 1. Send all steps as PENDING.
	if err := sendAllSteps(sendEvent, path.steps, dbsetup.StatePending); err != nil {
		return err
	}

	// 2. Subscribe to broadcaster for buildDatabase progress.
	eventCh, subID := s.dbInitializer.ProgressBroadcaster().SubscribeChan(progressEventBufferCapacity)
	defer s.dbInitializer.ProgressBroadcaster().Unsubscribe(subID)

	// 3. Handle embedded setup: start PG and derive connection config.
	if path.dbCfg == nil {
		if err := s.startEmbedded(ctx, path.persistCfg.Embedded, sendEvent); err != nil {
			return err
		}

		path.dbCfg = s.embeddedManager.DatabaseConfig()
	}

	// 4. Start initialization in a goroutine so we can forward broadcaster
	// events. Init runs on a context detached from the stream: it performs
	// durable side effects (migrations, installing the app state, the route
	// swap) that must not be torn down halfway just because the client went
	// away. Shutdown of an installed state goes through the App, not this
	// stream.
	initCfg := &serverconfig.Config{Database: path.dbCfg}
	initDone := make(chan error, 1)
	initCtx := context.WithoutCancel(ctx)

	go func() {
		initDone <- s.dbInitializer.InitializeDatabaseWithConfig(initCtx, initCfg)
	}()

	// 5. Forward broadcaster events until init completes or context cancels.
	for {
		select {
		case <-ctx.Done():
			// The client disconnected after init started. The route swap
			// inside InitializeDatabaseWithConfig happens before init
			// completes, so the frontend often navigates away exactly here.
			// Wait for init and persist the config anyway: without it the
			// database ends up initialized while config.yaml was never
			// written — the wizard then refuses to re-run
			// (FailedPrecondition) yet a restart drops back to onboarding.
			s.awaitInitAndPersist(initDone, path.persistCfg, sendEvent) //nolint:contextcheck // persisting uses a background context by design: the stream is gone

			return ctx.Err()

		case e := <-eventCh:
			if err := sendEvent(e); err != nil {
				// Stream broken mid-init (client disconnect surfacing on
				// Send rather than on the context) — same handling as above.
				s.awaitInitAndPersist(initDone, path.persistCfg, sendEvent) //nolint:contextcheck // persisting uses a background context by design: the stream is gone

				return err
			}

		case initErr := <-initDone:
			// Drain any remaining buffered events so the client sees the
			// FAILED step with its error message.
			drainEvents(eventCh, sendEvent)

			if initErr != nil {
				// The failure details are already conveyed through the
				// progress events (the failed step includes the error
				// message). Close the stream gracefully so the client
				// can present the step-level error to the user.
				return nil
			}

			// 6. Persist configuration.
			return s.persistConfig(path.persistCfg, sendEvent) //nolint:contextcheck // UpdateConfig uses background context for reload
		}
	}
}

func (s *Service) watchConfigChanges(ctx context.Context, sendEvent func(dbsetup.ProgressEvent) error) error {
	steps := []dbsetup.StepID{
		dbsetup.StepWaitingForConfig,
		dbsetup.StepConfigDetected,
		dbsetup.StepConnecting,
		dbsetup.StepMigrating,
		dbsetup.StepInitializingServices,
	}

	// 1. Send all steps as PENDING.
	if err := sendAllSteps(sendEvent, steps, dbsetup.StatePending); err != nil {
		return err
	}

	// 2. Send waiting_for_config as IN_PROGRESS.
	if err := sendEvent(dbsetup.NewEvent(dbsetup.StepWaitingForConfig, dbsetup.StateInProgress)); err != nil {
		return err
	}

	// 3. Subscribe to config changes before inspecting CurrentConfig so a save
	// that races with watch startup cannot be missed.
	configCh := make(chan *serverconfig.Config, 4)

	configSubID := s.configManager.Subscribe(func(_, newCfg *serverconfig.Config) {
		select {
		case configCh <- newCfg:
		default:
		}
	})
	defer s.configManager.Unsubscribe(configSubID)

	// 4. Subscribe to broadcaster for buildDatabase progress.
	eventCh, subID := s.dbInitializer.ProgressBroadcaster().SubscribeChan(progressEventBufferCapacity)
	defer s.dbInitializer.ProgressBroadcaster().Unsubscribe(subID)

	// 5. Wait loop.
	configDetected := false
	handleConfig := func(newCfg *serverconfig.Config) error {
		if !hasAppDatabaseConfig(newCfg) || configDetected {
			return nil
		}

		configDetected = true

		if err := sendEvent(dbsetup.NewEvent(dbsetup.StepWaitingForConfig, dbsetup.StateSucceeded)); err != nil {
			return err
		}

		return sendEvent(dbsetup.NewEvent(dbsetup.StepConfigDetected, dbsetup.StateSucceeded))
	}

	if err := handleConfig(s.configManager.CurrentConfig()); err != nil {
		return err
	}

	for {
		select {
		case <-ctx.Done():
			return ctx.Err()

		case newCfg := <-configCh:
			if err := handleConfig(newCfg); err != nil {
				return err
			}

		case e := <-eventCh:
			if err := sendEvent(e); err != nil {
				return err
			}

			// If initialization succeeded, close the stream.
			if e.StepID == dbsetup.StepInitializingServices && e.State == dbsetup.StateSucceeded {
				return nil
			}
		}
	}
}

func (s *Service) setupMethodAvailabilities(isHomeWritable bool) []*v1alpha1.SetupMethodAvailability {
	ui := &v1alpha1.SetupMethodAvailability{
		Method:    v1alpha1.SetupMethod_SETUP_METHOD_UI_CONFIGURED,
		Available: isHomeWritable,
	}
	if !ui.Available {
		ui.UnavailableReason = homeNotWritableReason
	}

	embedded := &v1alpha1.SetupMethodAvailability{
		Method:    v1alpha1.SetupMethod_SETUP_METHOD_EMBEDDED,
		Available: isHomeWritable && s.embeddedManager != nil,
	}
	if !embedded.Available {
		switch {
		case s.embeddedManager == nil && s.embeddedReason != "":
			embedded.UnavailableReason = s.embeddedReason
		case s.embeddedManager == nil:
			embedded.UnavailableReason = embeddedUnavailableReason
		default:
			embedded.UnavailableReason = homeNotWritableReason
		}
	}

	return []*v1alpha1.SetupMethodAvailability{
		ui,
		{
			Method:    v1alpha1.SetupMethod_SETUP_METHOD_MANUAL_YAML,
			Available: true,
		},
		embedded,
	}
}

func availableSetupMethods(availabilities []*v1alpha1.SetupMethodAvailability) []v1alpha1.SetupMethod {
	methods := make([]v1alpha1.SetupMethod, 0, len(availabilities))
	for _, availability := range availabilities {
		if availability.Available {
			methods = append(methods, availability.Method)
		}
	}

	return methods
}

func hasAppDatabaseConfig(cfg *serverconfig.Config) bool {
	return cfg != nil && (cfg.Database != nil || cfg.Embedded != nil)
}

// setupPath holds the resolved configuration for a setup request.
type setupPath struct {
	dbCfg      *serverconfig.Database // nil for embedded (derived after Start)
	persistCfg *serverconfig.Config   // config to write to disk
	steps      []dbsetup.StepID
}

// resolveSetupPath parses the oneof in SetupAppDatabaseRequest and returns
// the database config, persist config, and ordered steps. It is a pure
// function — no side effects, easy to table-test.
func resolveSetupPath(
	msg *v1alpha1.SetupAppDatabaseRequest,
	availabilities []*v1alpha1.SetupMethodAvailability,
) (*setupPath, error) {
	switch setup := msg.Setup.(type) {
	case *v1alpha1.SetupAppDatabaseRequest_PostgresConfig:
		if err := requireSetupMethodAvailable(availabilities, v1alpha1.SetupMethod_SETUP_METHOD_UI_CONFIGURED); err != nil {
			return nil, err
		}

		pgCfg := setup.PostgresConfig
		dbCfg := &serverconfig.Database{
			Host:           pgCfg.Host,
			Port:           int(pgCfg.Port),
			Database:       pgCfg.Database,
			Username:       pgCfg.Username,
			Password:       pgCfg.Password,
			SSLMode:        pgconv.SSLModeFromProto(pgCfg.SslMode),
			SSLNegotiation: pgconv.SSLNegotiationFromProto(pgCfg.SslNegotiation),
		}

		return &setupPath{
			dbCfg:      dbCfg,
			persistCfg: &serverconfig.Config{Database: dbCfg},
			steps: []dbsetup.StepID{
				dbsetup.StepConnecting,
				dbsetup.StepMigrating,
				dbsetup.StepInitializingServices,
				dbsetup.StepPersistingConfig,
			},
		}, nil

	case *v1alpha1.SetupAppDatabaseRequest_EmbeddedConfig:
		if err := requireSetupMethodAvailable(availabilities, v1alpha1.SetupMethod_SETUP_METHOD_EMBEDDED); err != nil {
			return nil, err
		}

		return &setupPath{
			persistCfg: buildEmbeddedPersistConfig(setup.EmbeddedConfig),
			steps: []dbsetup.StepID{
				dbsetup.StepStartingEmbedded,
				dbsetup.StepConnecting,
				dbsetup.StepMigrating,
				dbsetup.StepInitializingServices,
				dbsetup.StepPersistingConfig,
			},
		}, nil

	default:
		return nil, connect.NewError(connect.CodeInvalidArgument,
			errors.New("setup must specify either postgres_config or embedded_config"))
	}
}

func requireSetupMethodAvailable(
	availabilities []*v1alpha1.SetupMethodAvailability,
	method v1alpha1.SetupMethod,
) error {
	for _, availability := range availabilities {
		if availability.Method != method {
			continue
		}

		if availability.Available {
			return nil
		}

		return connect.NewError(connect.CodeFailedPrecondition, errors.New(availability.UnavailableReason))
	}

	return connect.NewError(connect.CodeFailedPrecondition, errors.New("setup method is not available in this environment"))
}

// startEmbedded starts embedded PostgreSQL and reports progress via sendEvent.
func (s *Service) startEmbedded(
	ctx context.Context,
	cfg *serverconfig.EmbeddedDatabase,
	sendEvent func(dbsetup.ProgressEvent) error,
) error {
	if err := sendEvent(dbsetup.NewEvent(dbsetup.StepStartingEmbedded, dbsetup.StateInProgress)); err != nil {
		return err
	}

	if err := s.embeddedManager.StartWithConfig(ctx, embeddedpg.ConfigFromServerConfig(cfg)); err != nil {
		_ = sendEvent(dbsetup.NewErrorEvent(dbsetup.StepStartingEmbedded, err.Error()))

		return connect.NewError(connect.CodeInternal,
			fmt.Errorf("failed to start embedded PostgreSQL: %w", err))
	}

	return sendEvent(dbsetup.NewEvent(dbsetup.StepStartingEmbedded, dbsetup.StateSucceeded))
}

// awaitInitAndPersist waits for an in-flight database initialization to
// finish and persists the configuration when it succeeded. Used when the
// setup stream dies (context cancelled or Send failed) after initialization
// has already started — the durable work must still be completed so the
// configuration on disk matches the initialized database.
func (s *Service) awaitInitAndPersist(
	initDone <-chan error,
	persistCfg *serverconfig.Config,
	sendEvent func(dbsetup.ProgressEvent) error,
) {
	if initErr := <-initDone; initErr != nil {
		return
	}

	if err := s.persistConfig(persistCfg, sendEvent); err != nil {
		slog.Error("failed to persist config after setup stream disconnected", "error", err)
	}
}

// persistConfig writes the config to disk and reports progress via sendEvent.
// Stream events are best-effort: the config is written even if the client has
// already disconnected (e.g. because the frontend navigated away after the
// route swap to MainApp).
//
// The persisted config is based on the live configuration so pre-existing
// customization (http host/port, CORS, access_log, ...) survives the rewrite —
// UpdateConfig atomically replaces the whole file, and onboarding only
// configures the database/embedded section.
func (s *Service) persistConfig(
	cfg *serverconfig.Config,
	sendEvent func(dbsetup.ProgressEvent) error,
) error {
	_ = sendEvent(dbsetup.NewEvent(dbsetup.StepPersistingConfig, dbsetup.StateInProgress))

	current := s.configManager.CurrentConfig()
	persisted := &serverconfig.Config{
		HTTP:      current.HTTP,
		Database:  cfg.Database,
		Embedded:  cfg.Embedded,
		Instances: current.Instances, // config-defined instances survive too
	}
	persisted.SetDefaults()

	if err := s.configManager.UpdateConfig(persisted); err != nil {
		slog.Error("failed to persist config after successful init", "error", err)

		_ = sendEvent(dbsetup.NewErrorEvent(dbsetup.StepPersistingConfig, err.Error()))

		return connect.NewError(connect.CodeInternal,
			fmt.Errorf("database initialized but failed to persist config: %w", err))
	}

	_ = sendEvent(dbsetup.NewEvent(dbsetup.StepPersistingConfig, dbsetup.StateSucceeded))

	return nil
}

// sendAllSteps sends an event for each step with the given state.
func sendAllSteps(
	sendEvent func(dbsetup.ProgressEvent) error,
	steps []dbsetup.StepID,
	state dbsetup.StepState,
) error {
	for _, id := range steps {
		if err := sendEvent(dbsetup.NewEvent(id, state)); err != nil {
			return err
		}
	}

	return nil
}

// drainEvents forwards any buffered events from the channel via sendEvent.
func drainEvents(
	ch <-chan dbsetup.ProgressEvent,
	sendEvent func(dbsetup.ProgressEvent) error,
) {
	for {
		select {
		case e := <-ch:
			_ = sendEvent(e)
		default:
			return
		}
	}
}

// buildEmbeddedPersistConfig creates the Config to write to disk for the
// embedded setup path. Only the Embedded section is persisted — the Database
// section is derived at runtime from the embedded manager.
func buildEmbeddedPersistConfig(embCfg *v1alpha1.EmbeddedSetupConfig) *serverconfig.Config {
	embedded := &serverconfig.EmbeddedDatabase{}
	embedded.SetDefaults()

	if embCfg.Port != 0 {
		embedded.Port = int(embCfg.Port)
	}

	if embCfg.Mode != "" {
		embedded.Mode = embCfg.Mode
	}

	return &serverconfig.Config{Embedded: embedded}
}
