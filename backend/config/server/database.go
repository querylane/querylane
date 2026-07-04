package server

import (
	"errors"
	"net"
	"net/url"
	"strconv"
	"strings"
)

// Database represents the Querylane metadata database configuration.
// Supports both DSN and individual field configuration.
type Database struct {
	// DSN is the full PostgreSQL connection string (e.g., "postgresql://user:pass@host:port/db?sslmode=require").
	// If provided, individual fields below are ignored.
	DSN string `koanf:"dsn"`

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
	Password string `koanf:"password"` //nolint:gosec // G101: Password is a legitimate config field name
}

// SetDefaults for database configuration.
func (d *Database) SetDefaults() {
	if d == nil || d.DSN != "" {
		return
	}

	if d.Host == "" {
		d.Host = "localhost"
	}

	if d.Port == 0 {
		d.Port = 5432
	}

	if d.SSLMode == "" {
		d.SSLMode = "prefer"
	}

	if d.SSLNegotiation == "" {
		d.SSLNegotiation = "postgres"
	}
}

// EffectiveDSN returns the configured DSN.
func (d *Database) EffectiveDSN() string {
	if d == nil {
		return ""
	}

	return d.DSN
}

// EffectivePassword returns the configured password.
func (d *Database) EffectivePassword() string {
	if d == nil {
		return ""
	}

	return d.Password
}

// ToDSN returns a PostgreSQL connection string. If DSN is already set, it is
// returned as-is. Otherwise a DSN is constructed from the individual fields.
func (d *Database) ToDSN() string {
	if dsn := d.EffectiveDSN(); dsn != "" {
		return dsn
	}

	u := &url.URL{
		Scheme: "postgresql",
		Host:   net.JoinHostPort(d.Host, strconv.Itoa(d.Port)),
		Path:   "/" + d.Database,
	}

	if pw := d.EffectivePassword(); pw != "" {
		u.User = url.UserPassword(d.Username, pw)
	} else {
		u.User = url.User(d.Username)
	}

	if d.SSLMode != "" {
		q := u.Query()
		q.Set("sslmode", d.SSLMode)
		u.RawQuery = q.Encode()
	}

	if d.SSLNegotiation != "" {
		q := u.Query()
		q.Set("sslnegotiation", d.SSLNegotiation)
		u.RawQuery = q.Encode()
	}

	return u.String()
}

// Validate database configuration.
func (d *Database) Validate() error {
	if d == nil {
		return errors.New("database configuration is required")
	}

	if dsn := d.EffectiveDSN(); dsn != "" {
		return validateDSN(dsn)
	}

	if d.Host == "" {
		return errors.New("host is required when DSN is not provided")
	}

	if d.Port <= 0 || d.Port > 65535 {
		return errors.New("port must be between 1 and 65535")
	}

	if d.Database == "" {
		return errors.New("database name is required when DSN is not provided")
	}

	if d.Username == "" {
		return errors.New("username is required when DSN is not provided")
	}

	return validateSSLConnectionOptions(d.SSLMode, d.SSLNegotiation)
}

// Redacted returns a copy of the database configuration with sensitive data redacted.
func (d *Database) Redacted() Database {
	if d == nil {
		return Database{}
	}

	redacted := *d

	if redacted.Password != "" {
		redacted.Password = "[REDACTED]"
	}

	if redacted.DSN != "" {
		redacted.DSN = redactDSN(redacted.DSN)
	}

	return redacted
}

// redactDSN removes sensitive information from a PostgreSQL DSN while preserving
// useful connection details for debugging (host, port, database name, etc.).
func redactDSN(dsn string) string {
	if strings.HasPrefix(dsn, "postgresql://") || strings.HasPrefix(dsn, "postgres://") {
		return redactPostgresURL(dsn)
	}

	if strings.Contains(dsn, "=") {
		return redactKeyValueDSN(dsn)
	}

	return "[REDACTED_DSN]"
}

func redactPostgresURL(dsn string) string {
	u, err := url.Parse(dsn)
	if err != nil {
		return "[INVALID_DSN]"
	}

	if u.User == nil {
		return u.String()
	}

	username := u.User.Username()
	if _, hasPassword := u.User.Password(); !hasPassword {
		return u.String()
	}

	return buildRedactedURL(u, username)
}

func buildRedactedURL(u *url.URL, username string) string {
	result := u.Scheme + "://" + username + ":[REDACTED]@" + u.Host
	if u.Path != "" {
		result += u.Path
	}

	if u.RawQuery != "" {
		result += "?" + u.RawQuery
	}

	if u.Fragment != "" {
		result += "#" + u.Fragment
	}

	return result
}

func redactKeyValueDSN(dsn string) string {
	parts := strings.Fields(dsn)
	redactedParts := make([]string, 0, len(parts))

	for _, part := range parts {
		redactedParts = append(redactedParts, redactKeyValuePart(part))
	}

	return strings.Join(redactedParts, " ")
}

func redactKeyValuePart(part string) string {
	if !strings.Contains(part, "=") {
		return part
	}

	kv := strings.SplitN(part, "=", 2)
	if len(kv) != 2 {
		return part
	}

	key := strings.ToLower(kv[0])
	value := kv[1]

	if key == "password" || key == "pass" {
		value = "[REDACTED]"
	}

	return key + "=" + value
}
