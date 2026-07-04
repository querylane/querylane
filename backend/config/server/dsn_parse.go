package server

import (
	"errors"
	"fmt"
	"net/url"
	"strconv"
	"strings"
)

// parsedDSNFields holds connection fields extracted from a PostgreSQL DSN string.
type parsedDSNFields struct {
	Host           string
	Port           int
	Database       string
	Username       string
	Password       string //nolint:gosec // G117: Password is a legitimate field name in a DSN parse result
	SSLMode        string
	SSLNegotiation string
}

// parseDSN parses a PostgreSQL DSN into individual connection fields and
// validates that required fields (host, username, database) are present.
// Supports both postgres:// URL format and key=value format.
func parseDSN(dsn string) (parsedDSNFields, error) {
	if strings.HasPrefix(dsn, "postgresql://") || strings.HasPrefix(dsn, "postgres://") {
		return parsePostgresURL(dsn)
	}

	if strings.Contains(dsn, "=") {
		return parseKeyValueDSN(dsn)
	}

	return parsedDSNFields{}, errors.New("invalid DSN format: expected postgresql:// URL or key=value pairs")
}

// validateDSN validates the format and content of a PostgreSQL DSN.
func validateDSN(dsn string) error {
	_, err := parseDSN(dsn)
	return err
}

// parsePostgresURL parses and validates a postgres:// URL.
func parsePostgresURL(dsn string) (parsedDSNFields, error) {
	u, err := url.Parse(dsn)
	if err != nil {
		return parsedDSNFields{}, fmt.Errorf("invalid DSN URL format: %w", err)
	}

	if u.Scheme != "postgresql" && u.Scheme != "postgres" {
		return parsedDSNFields{}, fmt.Errorf("invalid DSN scheme: expected 'postgresql' or 'postgres', got '%s'", u.Scheme)
	}

	if u.Host == "" {
		return parsedDSNFields{}, errors.New("DSN missing host")
	}

	if u.User == nil || u.User.Username() == "" {
		return parsedDSNFields{}, errors.New("DSN missing username")
	}

	if u.Path == "" || u.Path == "/" {
		return parsedDSNFields{}, errors.New("DSN missing database name")
	}

	port := 5432

	if portStr := u.Port(); portStr != "" {
		port, err = strconv.Atoi(portStr)
		if err != nil {
			return parsedDSNFields{}, fmt.Errorf("invalid port in DSN: %w", err)
		}
	}

	password, _ := u.User.Password()

	fields := parsedDSNFields{
		Host:           u.Hostname(),
		Port:           port,
		Database:       strings.TrimPrefix(u.Path, "/"),
		Username:       u.User.Username(),
		Password:       password,
		SSLMode:        u.Query().Get("sslmode"),
		SSLNegotiation: u.Query().Get("sslnegotiation"),
	}
	if err := validateSSLConnectionOptions(fields.SSLMode, fields.SSLNegotiation); err != nil {
		return parsedDSNFields{}, err
	}

	return fields, nil
}

// parseKeyValueDSN parses and validates a key=value format DSN.
func parseKeyValueDSN(dsn string) (parsedDSNFields, error) {
	fields := parsedDSNFields{Port: 5432}

	requiredKeys := map[string]bool{
		"host":   false,
		"user":   false,
		"dbname": false,
	}

	for part := range strings.FieldsSeq(dsn) {
		if !strings.Contains(part, "=") {
			return parsedDSNFields{}, fmt.Errorf("invalid DSN format: expected key=value pairs, got '%s'", part)
		}

		kv := strings.SplitN(part, "=", 2)
		if len(kv) != 2 {
			return parsedDSNFields{}, fmt.Errorf("invalid DSN key=value pair: '%s'", part)
		}

		key := strings.ToLower(kv[0])
		value := kv[1]

		if _, isRequired := requiredKeys[key]; isRequired {
			if value == "" {
				return parsedDSNFields{}, fmt.Errorf("DSN key '%s' cannot be empty", key)
			}

			requiredKeys[key] = true
		}

		switch key {
		case "host":
			fields.Host = value
		case "port":
			p, err := strconv.Atoi(value)
			if err != nil {
				return parsedDSNFields{}, fmt.Errorf("invalid port in DSN: %w", err)
			}

			fields.Port = p
		case "dbname":
			fields.Database = value
		case "user":
			fields.Username = value
		case "password":
			fields.Password = value
		case "sslmode":
			fields.SSLMode = value
		case "sslnegotiation":
			fields.SSLNegotiation = value
		}
	}

	for key, found := range requiredKeys {
		if !found {
			return parsedDSNFields{}, fmt.Errorf("DSN missing required key: %s", key)
		}
	}

	if err := validateSSLConnectionOptions(fields.SSLMode, fields.SSLNegotiation); err != nil {
		return parsedDSNFields{}, err
	}

	return fields, nil
}
