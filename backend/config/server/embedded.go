package server

import (
	"errors"
	"fmt"
	"os"
	"path/filepath"
	"time"
)

// EmbeddedDatabase represents the configuration for the embedded PostgreSQL mode.
// Its presence (non-nil pointer in Config) means embedded mode is enabled.
type EmbeddedDatabase struct {
	Mode                string        `koanf:"mode"` // "persistent" or "ephemeral"
	DataPath            string        `koanf:"data_path"`
	Port                int           `koanf:"port"`
	HealthCheckInterval time.Duration `koanf:"health_check_interval"`
}

// SetDefaults fills in zero-value fields with sensible defaults.
func (e *EmbeddedDatabase) SetDefaults() {
	if e.Mode == "" {
		e.Mode = "persistent"
	}

	if e.DataPath == "" {
		home, err := os.UserHomeDir()
		if err != nil {
			home = "."
		}

		e.DataPath = filepath.Join(home, ".querylane", "pgdata")
	}

	if e.Port == 0 {
		e.Port = 5433
	}

	if e.HealthCheckInterval == 0 {
		e.HealthCheckInterval = 10 * time.Second
	}
}

// Validate checks the embedded database configuration for errors.
func (e *EmbeddedDatabase) Validate() error {
	switch e.Mode {
	case "persistent", "ephemeral":
		// valid
	default:
		return fmt.Errorf("invalid embedded mode %q: must be \"persistent\" or \"ephemeral\"", e.Mode)
	}

	if e.DataPath == "" {
		return errors.New("embedded data_path is required")
	}

	if e.Port <= 0 || e.Port > 65535 {
		return errors.New("embedded port must be between 1 and 65535")
	}

	if e.HealthCheckInterval <= 0 {
		return errors.New("embedded health_check_interval must be positive")
	}

	return nil
}
