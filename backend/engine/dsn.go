package engine

import (
	"context"
	"crypto/sha256"
	"net"
	"net/url"
	"strconv"

	api "github.com/querylane/querylane/backend/protogen/querylane/console/v1alpha1"
)

const defaultSSLMode = "prefer"

// dsnFingerprint digests a fully-resolved DSN so pool caches can detect
// connection config changes without retaining resolved secrets.
func dsnFingerprint(dsn string) [sha256.Size]byte {
	return sha256.Sum256([]byte(dsn))
}

// ConfigToDSN converts a PostgresConfig to a PostgreSQL connection string.
func ConfigToDSN(config *api.PostgresConfig) string {
	dsn, err := ConfigToDSNWithSecretResolver(context.Background(), config, LocalSecretResolver{})
	if err != nil {
		return ""
	}

	return dsn
}

// ConfigToDSNWithSecretResolver converts a PostgresConfig to a PostgreSQL
// connection string after resolving the configured password source.
func ConfigToDSNWithSecretResolver(ctx context.Context, config *api.PostgresConfig, resolver SecretResolver) (string, error) {
	if config == nil {
		return "", nil
	}

	// Require at least host and database for a valid DSN
	if config.GetHost() == "" || config.GetDatabase() == "" {
		return "", nil
	}

	password := config.GetPassword()
	if source := config.GetPasswordSource(); source != nil {
		resolved, err := resolver.ResolveSecret(ctx, source)
		if err != nil {
			return "", err
		}

		password = resolved
	}

	sslMode := sslModeToString(config.GetSslMode())

	// connect_timeout bounds raw TCP/startup dials even when the request
	// context carries no deadline (e.g. background catalog sync).
	// application_name identifies our pool backends in pg_stat_activity
	// (connection breakdowns, operators inspecting the instance).
	rawQuery := "sslmode=" + sslMode + "&client_encoding=UTF8&connect_timeout=10&application_name=querylane"
	if sslNegotiation := sslNegotiationToString(config.GetSslNegotiation()); sslNegotiation != "" {
		rawQuery += "&sslnegotiation=" + sslNegotiation
	}

	u := &url.URL{
		Scheme:   "postgres",
		Host:     net.JoinHostPort(config.GetHost(), strconv.Itoa(int(config.GetPort()))),
		Path:     config.GetDatabase(),
		User:     url.UserPassword(config.GetUsername(), password),
		RawQuery: rawQuery,
	}

	return u.String(), nil
}

// sslModeToString converts protobuf SSL mode enum to string value.
func sslModeToString(mode api.PostgresConfig_SslMode) string {
	switch mode {
	case api.PostgresConfig_SSL_MODE_DISABLED:
		return "disable"
	case api.PostgresConfig_SSL_MODE_ALLOW:
		return "allow"
	case api.PostgresConfig_SSL_MODE_PREFER:
		return defaultSSLMode
	case api.PostgresConfig_SSL_MODE_REQUIRE:
		return "require"
	case api.PostgresConfig_SSL_MODE_VERIFY_CA:
		return "verify-ca"
	case api.PostgresConfig_SSL_MODE_VERIFY_FULL:
		return "verify-full"
	case api.PostgresConfig_SSL_MODE_UNSPECIFIED:
		return defaultSSLMode // Safe default
	default:
		return defaultSSLMode // Safe default
	}
}

// sslNegotiationToString converts protobuf SSL negotiation enum to the libpq
// connection parameter value.
func sslNegotiationToString(mode api.PostgresConfig_SslNegotiation) string {
	switch mode {
	case api.PostgresConfig_SSL_NEGOTIATION_POSTGRES:
		return "postgres"
	case api.PostgresConfig_SSL_NEGOTIATION_DIRECT:
		return "direct"
	case api.PostgresConfig_SSL_NEGOTIATION_UNSPECIFIED:
		return ""
	default:
		return ""
	}
}
