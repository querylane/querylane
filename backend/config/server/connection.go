package server

import (
	"fmt"
	"os"
)

// validSSLModes is the set of PostgreSQL SSL mode strings accepted in config.
var validSSLModes = map[string]struct{}{
	"disable":     {},
	"allow":       {},
	"prefer":      {},
	"require":     {},
	"verify-ca":   {},
	"verify-full": {},
}

var validSSLNegotiations = map[string]struct{}{
	"postgres": {},
	"direct":   {},
}

// resolveSecret resolves a secret value from an environment variable.
// Returns ("", nil) if envName is empty, so the caller can fall back to its
// inline value. Returns an error if the variable is not set or is empty.
func resolveSecret(envName string) (string, error) {
	if envName == "" {
		return "", nil
	}

	val, ok := os.LookupEnv(envName)
	if !ok {
		return "", fmt.Errorf("environment variable %q is not set", envName)
	}

	if val == "" {
		return "", fmt.Errorf("environment variable %q is set but empty", envName)
	}

	return val, nil
}

func hasDSNSource(dsn, dsnEnv string) bool {
	return dsn != "" || dsnEnv != ""
}

func validateSSLMode(sslMode string) error {
	if sslMode == "" {
		return nil
	}

	if _, ok := validSSLModes[sslMode]; !ok {
		return fmt.Errorf("invalid ssl_mode %q: must be one of disable, allow, prefer, require, verify-ca, verify-full", sslMode)
	}

	return nil
}

func validateSSLNegotiation(sslNegotiation string) error {
	if sslNegotiation == "" {
		return nil
	}

	if _, ok := validSSLNegotiations[sslNegotiation]; !ok {
		return fmt.Errorf("invalid ssl_negotiation %q: must be one of postgres, direct", sslNegotiation)
	}

	return nil
}

func validateSSLConnectionOptions(sslMode, sslNegotiation string) error {
	if err := validateSSLMode(sslMode); err != nil {
		return err
	}

	if err := validateSSLNegotiation(sslNegotiation); err != nil {
		return err
	}

	if sslNegotiation == "direct" && !isDirectSSLNegotiationMode(sslMode) {
		return fmt.Errorf("ssl_negotiation %q requires ssl_mode require, verify-ca, or verify-full", sslNegotiation)
	}

	return nil
}

func isDirectSSLNegotiationMode(sslMode string) bool {
	switch sslMode {
	case "require", "verify-ca", "verify-full":
		return true
	default:
		return false
	}
}
