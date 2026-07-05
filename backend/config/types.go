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

// NewLogHandlerOptions returns the slog JSON handler options used across all
// commands: the given level plus a ReplaceAttr that renders time.Duration
// values as human-readable strings (e.g. "77.8ms") instead of raw nanosecond
// integers, which the default JSON handler would otherwise emit.
func NewLogHandlerOptions(level slog.Level) *slog.HandlerOptions {
	return &slog.HandlerOptions{
		Level:     level,
		AddSource: false,
		ReplaceAttr: func(_ []string, a slog.Attr) slog.Attr {
			if a.Value.Kind() == slog.KindDuration {
				a.Value = slog.StringValue(a.Value.Duration().String())
			}

			return a
		},
	}
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
