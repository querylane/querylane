package config

import (
	"log/slog"

	"github.com/alecthomas/kong"
)

// Globals contains global CLI flags shared across all commands.
type Globals struct {
	Version  kong.VersionFlag `help:"Show version info"      short:"V"`
	Verbose  bool             `help:"Enable verbose logging" short:"v"`
	LogLevel string           `default:"info"                enum:"debug,info,warn,error"  help:"Log level"`
	NoColor  bool             `env:"NO_COLOR"                help:"Disable colored output"`
}

// ParseLogLevel parses log level string and verbose flag into slog.Level.
func ParseLogLevel(level string, verbose bool) slog.Level {
	if verbose {
		return slog.LevelDebug
	}

	switch level {
	case "debug":
		return slog.LevelDebug
	case "info":
		return slog.LevelInfo
	case "warn":
		return slog.LevelWarn
	case "error":
		return slog.LevelError
	default:
		return slog.LevelInfo
	}
}
