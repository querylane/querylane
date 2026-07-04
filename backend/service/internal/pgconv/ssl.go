// Package pgconv provides shared conversion helpers between server-side
// PostgreSQL configuration types and their protobuf representations.
package pgconv

import (
	v1alpha1 "github.com/querylane/querylane/backend/protogen/querylane/console/v1alpha1"
)

// DefaultSSLMode is the SSL mode used when no explicit mode is specified.
const (
	DefaultSSLMode        = "prefer"
	defaultSSLNegotiation = "postgres"
	directSSLNegotiation  = "direct"
)

// SSLModeToProto converts a server-side SSL mode string to its protobuf enum.
func SSLModeToProto(sslMode string) v1alpha1.PostgresConfig_SslMode {
	switch sslMode {
	case "disable":
		return v1alpha1.PostgresConfig_SSL_MODE_DISABLED
	case "allow":
		return v1alpha1.PostgresConfig_SSL_MODE_ALLOW
	case "prefer":
		return v1alpha1.PostgresConfig_SSL_MODE_PREFER
	case "require":
		return v1alpha1.PostgresConfig_SSL_MODE_REQUIRE
	case "verify-ca":
		return v1alpha1.PostgresConfig_SSL_MODE_VERIFY_CA
	case "verify-full":
		return v1alpha1.PostgresConfig_SSL_MODE_VERIFY_FULL
	case "":
		return v1alpha1.PostgresConfig_SSL_MODE_UNSPECIFIED
	default:
		return v1alpha1.PostgresConfig_SSL_MODE_UNSPECIFIED
	}
}

// SSLModeFromProto converts a protobuf SSL mode enum to its server-side string.
// Defaults to "prefer" for unspecified or unrecognized values.
func SSLModeFromProto(sslMode v1alpha1.PostgresConfig_SslMode) string {
	switch sslMode {
	case v1alpha1.PostgresConfig_SSL_MODE_DISABLED:
		return "disable"
	case v1alpha1.PostgresConfig_SSL_MODE_ALLOW:
		return "allow"
	case v1alpha1.PostgresConfig_SSL_MODE_PREFER:
		return DefaultSSLMode
	case v1alpha1.PostgresConfig_SSL_MODE_REQUIRE:
		return "require"
	case v1alpha1.PostgresConfig_SSL_MODE_VERIFY_CA:
		return "verify-ca"
	case v1alpha1.PostgresConfig_SSL_MODE_VERIFY_FULL:
		return "verify-full"
	case v1alpha1.PostgresConfig_SSL_MODE_UNSPECIFIED:
		return DefaultSSLMode
	default:
		return DefaultSSLMode
	}
}

// SSLNegotiationToProto converts a server-side SSL negotiation string to its
// protobuf enum.
func SSLNegotiationToProto(sslNegotiation string) v1alpha1.PostgresConfig_SslNegotiation {
	switch sslNegotiation {
	case defaultSSLNegotiation:
		return v1alpha1.PostgresConfig_SSL_NEGOTIATION_POSTGRES
	case directSSLNegotiation:
		return v1alpha1.PostgresConfig_SSL_NEGOTIATION_DIRECT
	case "":
		return v1alpha1.PostgresConfig_SSL_NEGOTIATION_UNSPECIFIED
	default:
		return v1alpha1.PostgresConfig_SSL_NEGOTIATION_UNSPECIFIED
	}
}

// SSLNegotiationFromProto converts a protobuf SSL negotiation enum to its
// server-side string. Defaults to "postgres" for unspecified or unrecognized
// values.
func SSLNegotiationFromProto(sslNegotiation v1alpha1.PostgresConfig_SslNegotiation) string {
	switch sslNegotiation {
	case v1alpha1.PostgresConfig_SSL_NEGOTIATION_POSTGRES:
		return defaultSSLNegotiation
	case v1alpha1.PostgresConfig_SSL_NEGOTIATION_DIRECT:
		return directSSLNegotiation
	case v1alpha1.PostgresConfig_SSL_NEGOTIATION_UNSPECIFIED:
		return defaultSSLNegotiation
	default:
		return defaultSSLNegotiation
	}
}
