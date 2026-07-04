package server

import (
	"testing"

	"github.com/stretchr/testify/assert"
	"github.com/stretchr/testify/require"
)

func TestHTTPSetDefaultsAccessLog(t *testing.T) {
	t.Parallel()

	accessLogDisabled := false
	accessLogEnabled := true

	tests := []struct {
		name string
		in   *bool
		want bool
	}{
		{name: "unset defaults to enabled", in: nil, want: true},
		{name: "explicit false is preserved", in: &accessLogDisabled, want: false},
		{name: "explicit true is preserved", in: &accessLogEnabled, want: true},
	}

	for _, tt := range tests {
		t.Run(tt.name, func(t *testing.T) {
			t.Parallel()

			h := HTTP{AccessLog: tt.in}
			h.SetDefaults()

			require.NotNil(t, h.AccessLog)
			assert.Equal(t, tt.want, *h.AccessLog)
			assert.Equal(t, tt.want, h.AccessLogEnabled())
		})
	}
}

func TestHTTPAccessLogEnabledDefaultsTrueWhenUnset(t *testing.T) {
	t.Parallel()

	h := HTTP{}
	assert.True(t, h.AccessLogEnabled(), "unset access_log must behave as enabled")

	accessLogDisabled := false
	h.AccessLog = &accessLogDisabled
	assert.False(t, h.AccessLogEnabled())
}

func TestCORSSetDefaultsPreservesCustomValues(t *testing.T) {
	t.Parallel()

	c := CORS{
		AllowedOrigins: []string{"https://example.com"},
		AllowedMethods: []string{"GET"},
	}
	c.SetDefaults()

	assert.Equal(t, []string{"https://example.com"}, c.AllowedOrigins,
		"explicit allowed_origins must not be clobbered by defaults")
	assert.Equal(t, []string{"GET"}, c.AllowedMethods)
	assert.NotEmpty(t, c.AllowedHeaders, "unset fields still receive defaults")
	assert.NotEmpty(t, c.ExposedHeaders)
}

func TestCORSSetDefaultsFillsUnsetValues(t *testing.T) {
	t.Parallel()

	c := CORS{}
	c.SetDefaults()

	assert.Equal(t, []string{"*"}, c.AllowedOrigins)
	assert.NotEmpty(t, c.AllowedMethods)
	assert.Contains(t, c.AllowedHeaders, "sentry-trace")
	assert.Contains(t, c.AllowedHeaders, "baggage")
	assert.NotEmpty(t, c.ExposedHeaders)
}
