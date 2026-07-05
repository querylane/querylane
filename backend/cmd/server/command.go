package server

import (
	"context"
	"log/slog"
	"os"
	"os/signal"
	"syscall"

	"github.com/querylane/querylane/backend/config"
)

// Command contains all server-related commands.
type Command struct {
	Start StartCmd `cmd:"" help:"Start the server that serves the Web UI"`
}

// StartCmd starts the API server.
type StartCmd struct {
	Config string `help:"Path to config file"            optional:"" placeholder:"/path/to/config.yaml" type:"path"`
	Port   int    `help:"Server port (overrides config)" short:"p"`
	Host   string `help:"Server host (overrides config)" short:"h"`
}

// Run boots the HTTP server and blocks until shutdown. It loads config
// (file + env), wires the Controller, and traps SIGINT/SIGTERM.
func (cmd *StartCmd) Run(g *config.Globals) error {
	// 1. Setup logger based on global settings
	logLevel := config.ParseLogLevel(g.LogLevel, g.Verbose)
	logger := slog.New(slog.NewJSONHandler(os.Stdout, config.NewLogHandlerOptions(logLevel)))
	slog.SetDefault(logger)

	// 2. Create config manager and load configuration
	var options []config.Option
	if cmd.Config != "" {
		options = append(options, config.WithConfigFile(cmd.Config))
	}

	options = append(options, config.WithFilewatcher())

	configManager, err := config.NewConfigManager(context.Background(), defaultConfig(), options...)
	if err != nil {
		logger.Error("failed to create config manager", slog.Any("error", err))
		return err
	}
	defer configManager.Stop()

	// Get current configuration
	cfg := configManager.CurrentConfig()

	// Log configuration status for user awareness
	slog.Info("configuration loaded",
		"database_configured", cfg.Database != nil && (cfg.Database.EffectiveDSN() != "" || cfg.Database.Host != ""),
		"can_write_config", configManager.CanWriteConfig(),
		"config_persisted", configManager.ConfigPersisted(),
		"config_path", configManager.ConfigFilePath())

	// 3. Setup server with context cancellation
	ctx, cancel := context.WithCancel(context.Background())
	defer cancel()

	// Setup signal handling to cancel context and log when we actually receive a signal
	signalChan := make(chan os.Signal, 1)
	signal.Notify(signalChan, os.Interrupt, syscall.SIGTERM)

	go func() {
		<-signalChan
		slog.InfoContext(ctx, "received signal")
		cancel()
	}()

	ctrl := NewController(configManager)
	// CLI flags take precedence over the configured listen address.
	ctrl.SetListenOverrides(cmd.Host, cmd.Port)

	// 4. Start server. The server will watch for context cancellation and initiate
	// a clean server shutdown and stops all its own managed dependencies.
	err = ctrl.Run(ctx)
	if err != nil {
		// If we return the error here, it will be logged by the CLI again, possibly in
		// a different logging format, more suitable for the normal commands.
		slog.ErrorContext(ctx, "server stopped with an error", slog.Any("error", err))
	}

	return nil
}
