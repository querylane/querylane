package server

import (
	"context"
	"fmt"
	"log/slog"
	"os"
	"os/signal"
	"syscall"

	"github.com/querylane/querylane/backend/config"
)

// Command contains all server-related commands.
type Command struct {
	ResetConfig ResetConfigCmd `cmd:"" help:"Reset internal storage configuration"`
	Start       StartCmd       `cmd:"" help:"Start the server that serves the Web UI"`
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
		return fmt.Errorf("creating config manager: %w", err)
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
	ctx, cancel := signal.NotifyContext(context.Background(), os.Interrupt, syscall.SIGTERM)
	defer cancel()

	ctrl := NewController(configManager)
	// CLI flags take precedence over the configured listen address.
	ctrl.SetListenOverrides(cmd.Host, cmd.Port)

	// 4. Start server. The server will watch for context cancellation and initiate
	// a clean server shutdown and stops all its own managed dependencies.
	// Kong reports terminal errors once at the CLI entrypoint.
	return ctrl.Run(ctx)
}
