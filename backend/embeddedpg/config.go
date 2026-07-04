package embeddedpg

import (
	"errors"
	"fmt"
	"os"
	"path/filepath"
	"time"
)

// Mode determines how the embedded PostgreSQL data directory is managed.
type Mode string

const (
	// ModePersistent keeps the data directory across restarts.
	ModePersistent Mode = "persistent"
	// ModeEphemeral removes the data directory on Stop.
	ModeEphemeral Mode = "ephemeral"
)

// Config holds the configuration for the embedded PostgreSQL manager.
// This is the manager's internal config — not a koanf deserialization target.
type Config struct {
	Mode                Mode
	DataPath            string
	Port                int
	HealthCheckInterval time.Duration
}

// SetDefaults fills in zero-value fields with sensible defaults.
func (c *Config) SetDefaults() {
	if c.Mode == "" {
		c.Mode = ModePersistent
	}

	if c.DataPath == "" {
		home, err := os.UserHomeDir()
		if err != nil {
			home = "."
		}

		c.DataPath = filepath.Join(home, ".querylane", "pgdata")
	}

	if c.Port == 0 {
		c.Port = 5433
	}

	if c.HealthCheckInterval == 0 {
		c.HealthCheckInterval = 10 * time.Second
	}
}

// Validate checks the configuration for errors.
func (c *Config) Validate() error {
	switch c.Mode {
	case ModePersistent, ModeEphemeral:
		// valid
	default:
		return fmt.Errorf("invalid embedded mode %q: must be %q or %q", c.Mode, ModePersistent, ModeEphemeral)
	}

	if c.DataPath == "" {
		return errors.New("embedded data_path is required")
	}

	if c.Port <= 0 || c.Port > 65535 {
		return errors.New("embedded port must be between 1 and 65535")
	}

	if c.HealthCheckInterval <= 0 {
		return errors.New("embedded health_check_interval must be positive")
	}

	return nil
}
