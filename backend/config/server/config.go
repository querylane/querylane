package server

import (
	"context"
	"errors"
	"fmt"
	"regexp"

	"github.com/querylane/querylane/backend/config"
)

// instanceIDPattern matches the instance_id portion of the resource name pattern
// defined in proto/querylane/console/v1alpha1/instance.proto.
var instanceIDPattern = regexp.MustCompile(`^[a-zA-Z]([a-zA-Z0-9_-]*[a-zA-Z0-9])?$`)

var _ config.Node = (*Config)(nil)

// Config represents the server configuration.
type Config struct {
	HTTP     HTTP              `koanf:"http"`
	Database *Database         `koanf:"database"`
	Embedded *EmbeddedDatabase `koanf:"embedded"`
	Limits   Limits            `koanf:"limits"`

	// Instances defines managed PostgreSQL instances via config (IaC mode).
	// When set, instances are read-only through the API — mutations are rejected.
	// Mutually exclusive with API-based instance management (XOR).
	Instances []*InstanceConfig `koanf:"instances"`
}

// SetDefaults for all configurations.
func (c *Config) SetDefaults() {
	c.HTTP.SetDefaults()
	c.Limits.SetDefaults()

	if c.Database != nil {
		c.Database.SetDefaults()
	}

	if c.Embedded != nil {
		c.Embedded.SetDefaults()
	}

	for _, inst := range c.Instances {
		inst.SetDefaults()
	}
}

// Validate all configurations.
func (c *Config) Validate() error {
	if err := c.HTTP.Validate(); err != nil {
		return fmt.Errorf("http: %w", err)
	}

	// Programmatic callers historically validate a partial Config directly.
	// Treat a wholly omitted limits section like the loader does, while still
	// rejecting invalid values in a section that was actually populated.
	if c.Limits == (Limits{}) {
		c.Limits.SetDefaults()
	}

	if err := c.Limits.Validate(); err != nil {
		return fmt.Errorf("limits: %w", err)
	}

	if c.Database != nil && c.Embedded != nil {
		return errors.New("cannot specify both 'database' and 'embedded'; use one or the other")
	}

	if c.Database != nil {
		// Apply defaults before validation. Config.SetDefaults() only runs on the
		// initial default struct, where Database is nil, so a partial database
		// section supplied via file or env hasn't had its defaults (port,
		// ssl_mode) applied yet — mirroring the instances handling below.
		c.Database.SetDefaults()

		if err := c.Database.Validate(); err != nil {
			return fmt.Errorf("database: %w", err)
		}
	}

	if c.Embedded != nil {
		// Same rationale as Database: fill embedded defaults (mode, data_path,
		// port, health_check_interval) before validating a partial section.
		c.Embedded.SetDefaults()

		if err := c.Embedded.Validate(); err != nil {
			return fmt.Errorf("embedded: %w", err)
		}
	}

	seen := make(map[string]struct{}, len(c.Instances))

	for i, inst := range c.Instances {
		if inst == nil {
			return fmt.Errorf("instances[%d]: entry must not be null", i)
		}

		if !instanceIDPattern.MatchString(inst.ID) {
			return fmt.Errorf("instances[%d]: %q is not a valid instance ID (must match %s)", i, inst.ID, instanceIDPattern.String())
		}

		if _, dup := seen[inst.ID]; dup {
			return fmt.Errorf("instances[%d]: duplicate instance ID %q", i, inst.ID)
		}

		seen[inst.ID] = struct{}{}

		// Apply defaults before validation. List entries from the config file
		// aren't present when Config.SetDefaults() runs on the initial default
		// struct, so instance-level defaults (port, ssl_mode, display_name)
		// haven't been applied yet.
		inst.SetDefaults()

		if err := inst.ResolveSecrets(); err != nil {
			return fmt.Errorf("instances[%d] (%s): %w", i, inst.ID, err)
		}

		if err := inst.Validate(); err != nil {
			return fmt.Errorf("instances[%d] (%s): %w", i, inst.ID, err)
		}
	}

	return nil
}

// OnLoadingComplete is called after configuration loading is complete.
func (c *Config) OnLoadingComplete(_ context.Context) {
	// Currently no post-loading setup needed for server config
	// This method can be extended in the future if needed
}
