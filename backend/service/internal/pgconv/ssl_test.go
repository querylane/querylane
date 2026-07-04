package pgconv

import (
	"testing"

	"github.com/stretchr/testify/assert"

	v1alpha1 "github.com/querylane/querylane/backend/protogen/querylane/console/v1alpha1"
)

func TestSSLModeToProto(t *testing.T) {
	t.Parallel()

	tests := []struct {
		name string
		mode string
		want v1alpha1.PostgresConfig_SslMode
	}{
		{name: "disable", mode: "disable", want: v1alpha1.PostgresConfig_SSL_MODE_DISABLED},
		{name: "allow", mode: "allow", want: v1alpha1.PostgresConfig_SSL_MODE_ALLOW},
		{name: "prefer", mode: "prefer", want: v1alpha1.PostgresConfig_SSL_MODE_PREFER},
		{name: "require", mode: "require", want: v1alpha1.PostgresConfig_SSL_MODE_REQUIRE},
		{name: "verify-ca", mode: "verify-ca", want: v1alpha1.PostgresConfig_SSL_MODE_VERIFY_CA},
		{name: "verify-full", mode: "verify-full", want: v1alpha1.PostgresConfig_SSL_MODE_VERIFY_FULL},
		{name: "empty string", mode: "", want: v1alpha1.PostgresConfig_SSL_MODE_UNSPECIFIED},
		{name: "unknown mode", mode: "bogus", want: v1alpha1.PostgresConfig_SSL_MODE_UNSPECIFIED},
	}

	for _, tt := range tests {
		t.Run(tt.name, func(t *testing.T) {
			t.Parallel()

			assert.Equal(t, tt.want, SSLModeToProto(tt.mode))
		})
	}
}

func TestSSLModeFromProto(t *testing.T) {
	t.Parallel()

	tests := []struct {
		name string
		mode v1alpha1.PostgresConfig_SslMode
		want string
	}{
		{name: "disabled", mode: v1alpha1.PostgresConfig_SSL_MODE_DISABLED, want: "disable"},
		{name: "allow", mode: v1alpha1.PostgresConfig_SSL_MODE_ALLOW, want: "allow"},
		{name: "prefer", mode: v1alpha1.PostgresConfig_SSL_MODE_PREFER, want: "prefer"},
		{name: "require", mode: v1alpha1.PostgresConfig_SSL_MODE_REQUIRE, want: "require"},
		{name: "verify ca", mode: v1alpha1.PostgresConfig_SSL_MODE_VERIFY_CA, want: "verify-ca"},
		{name: "verify full", mode: v1alpha1.PostgresConfig_SSL_MODE_VERIFY_FULL, want: "verify-full"},
		{name: "unspecified defaults to prefer", mode: v1alpha1.PostgresConfig_SSL_MODE_UNSPECIFIED, want: DefaultSSLMode},
		{name: "unknown enum defaults to prefer", mode: v1alpha1.PostgresConfig_SslMode(99), want: DefaultSSLMode},
	}

	for _, tt := range tests {
		t.Run(tt.name, func(t *testing.T) {
			t.Parallel()

			assert.Equal(t, tt.want, SSLModeFromProto(tt.mode))
		})
	}
}
