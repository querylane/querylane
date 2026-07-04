package server

import (
	"errors"
	"fmt"
)

// InstanceConfig defines a single managed PostgreSQL instance from the config file.
type InstanceConfig struct {
	// ID is the stable identifier for this instance. It becomes the resource
	// name "instances/{id}" and must match [a-zA-Z]([a-zA-Z0-9_-]*[a-zA-Z0-9])?.
	ID string `koanf:"id"`

	// DisplayName is the user-friendly name for this instance.
	// Defaults to ID if not specified.
	DisplayName string `koanf:"display_name"`

	// DSN is the full PostgreSQL connection string. If provided, the individual
	// fields below are ignored.
	DSN    string `koanf:"dsn"`
	DSNEnv string `koanf:"dsn_env"`

	// Individual connection fields (used if DSN is not provided).
	Host     string `koanf:"host"`
	Port     int    `koanf:"port"`
	Database string `koanf:"database"`
	Username string `koanf:"username"`
	SSLMode  string `koanf:"ssl_mode"`
	// SSLNegotiation maps to libpq's sslnegotiation option. Use "direct" only
	// with ssl_mode require, verify-ca, or verify-full.
	SSLNegotiation string `koanf:"ssl_negotiation"`

	// Password fields.
	Password    string `koanf:"password"` //nolint:gosec // G101: Password is a legitimate config field name
	PasswordEnv string `koanf:"password_env"`

	// Labels are optional key-value pairs for organizing instances.
	Labels map[string]string `koanf:"labels"`

	// Unexported resolved fields are never serialized.
	resolvedDSN      string
	resolvedPassword string

	// parsedDSN holds fields extracted from the effective DSN during ResolveSecrets.
	// Nil when no DSN is active. Downstream code should call the Effective*()
	// getters instead of reading Host/Port/… directly.
	parsedDSN *parsedDSNFields
}

// SetDefaults sets default values for the instance configuration.
func (c *InstanceConfig) SetDefaults() {
	if c.DisplayName == "" {
		c.DisplayName = c.ID
	}

	if hasDSNSource(c.DSN, c.DSNEnv) {
		return
	}

	if c.Port == 0 {
		c.Port = 5432
	}

	if c.SSLMode == "" {
		c.SSLMode = "prefer"
	}

	if c.SSLNegotiation == "" {
		c.SSLNegotiation = "postgres"
	}
}

// ResolveSecrets resolves DSN and password from file/env/inline sources.
// When a DSN is effective, it is additionally parsed into individual fields
// so that proto conversion and effective getters work correctly.
func (c *InstanceConfig) ResolveSecrets() error {
	c.resolvedDSN = ""
	c.resolvedPassword = ""
	c.parsedDSN = nil

	resolved, err := resolveSecret(c.DSNEnv)
	if err != nil {
		return fmt.Errorf("dsn: %w", err)
	}

	c.resolvedDSN = resolved

	if c.EffectiveDSN() == "" {
		resolved, err = resolveSecret(c.PasswordEnv)
		if err != nil {
			return fmt.Errorf("password: %w", err)
		}

		c.resolvedPassword = resolved
	}

	if dsn := c.EffectiveDSN(); dsn != "" {
		fields, err := parseDSN(dsn)
		if err != nil {
			return fmt.Errorf("parsing dsn: %w", err)
		}

		c.parsedDSN = &fields
	}

	return nil
}

// EffectiveDSN returns the selected DSN source (dsn_env > dsn).
func (c *InstanceConfig) EffectiveDSN() string {
	if c.DSNEnv != "" {
		return c.resolvedDSN
	}

	return c.DSN
}

// EffectiveHost returns the host from the parsed DSN or the inline Host field.
func (c *InstanceConfig) EffectiveHost() string {
	if c.parsedDSN != nil {
		return c.parsedDSN.Host
	}

	return c.Host
}

// EffectivePort returns the port from the parsed DSN or the inline Port field.
func (c *InstanceConfig) EffectivePort() int {
	if c.parsedDSN != nil {
		return c.parsedDSN.Port
	}

	return c.Port
}

// EffectiveDatabase returns the database from the parsed DSN or the inline Database field.
func (c *InstanceConfig) EffectiveDatabase() string {
	if c.parsedDSN != nil {
		return c.parsedDSN.Database
	}

	return c.Database
}

// EffectiveUsername returns the username from the parsed DSN or the inline Username field.
func (c *InstanceConfig) EffectiveUsername() string {
	if c.parsedDSN != nil {
		return c.parsedDSN.Username
	}

	return c.Username
}

// EffectivePassword returns the password from the parsed DSN, from a resolved
// file/env source, or from the inline Password field.
func (c *InstanceConfig) EffectivePassword() string {
	if c.parsedDSN != nil {
		return c.parsedDSN.Password
	}

	if c.PasswordEnv != "" {
		return c.resolvedPassword
	}

	return c.Password
}

// EffectiveSSLMode returns the ssl_mode from the parsed DSN or the inline SSLMode field.
func (c *InstanceConfig) EffectiveSSLMode() string {
	if c.parsedDSN != nil {
		return c.parsedDSN.SSLMode
	}

	return c.SSLMode
}

// EffectiveSSLNegotiation returns the ssl_negotiation from the parsed DSN or
// the inline SSLNegotiation field.
func (c *InstanceConfig) EffectiveSSLNegotiation() string {
	if c.parsedDSN != nil {
		return c.parsedDSN.SSLNegotiation
	}

	return c.SSLNegotiation
}

// Validate checks that all required fields are present and valid.
// Must be called after SetDefaults and ResolveSecrets.
func (c *InstanceConfig) Validate() error {
	if dsn := c.EffectiveDSN(); dsn != "" {
		// If ResolveSecrets already parsed the DSN successfully, skip re-parsing.
		if c.parsedDSN != nil {
			return nil
		}

		return validateDSN(dsn)
	}

	if c.Host == "" {
		return errors.New("host is required when DSN is not provided")
	}

	if c.Port <= 0 || c.Port > 65535 {
		return errors.New("port must be between 1 and 65535")
	}

	if c.Database == "" {
		return errors.New("database name is required when DSN is not provided")
	}

	if c.Username == "" {
		return errors.New("username is required when DSN is not provided")
	}

	if c.EffectivePassword() == "" {
		return errors.New("password is required (set password or password_env)")
	}

	return validateSSLConnectionOptions(c.SSLMode, c.SSLNegotiation)
}
