package server

import (
	"context"
	"testing"

	"github.com/stretchr/testify/assert"
	"github.com/stretchr/testify/require"

	"github.com/querylane/querylane/backend/config"
)

func TestInstanceTargetPolicyValidate(t *testing.T) {
	t.Parallel()

	tests := []struct {
		name   string
		policy InstanceTargetPolicy
		want   string
	}{
		{
			name: "valid allow and deny CIDRs",
			policy: InstanceTargetPolicy{
				AllowedCIDRs: []string{"10.0.0.0/8", "2001:db8::/32"},
				DeniedCIDRs:  []string{"10.10.0.0/16"},
			},
		},
		{
			name:   "invalid allow CIDR",
			policy: InstanceTargetPolicy{AllowedCIDRs: []string{"private-network"}},
			want:   `allowed_cidrs[0]: "private-network" is not a valid CIDR`,
		},
		{
			name:   "invalid deny CIDR",
			policy: InstanceTargetPolicy{DeniedCIDRs: []string{"127.0.0.1"}},
			want:   `denied_cidrs[0]: "127.0.0.1" is not a valid CIDR`,
		},
	}

	for _, tt := range tests {
		t.Run(tt.name, func(t *testing.T) {
			t.Parallel()

			err := tt.policy.Validate()
			if tt.want == "" {
				assert.NoError(t, err)

				return
			}

			assert.EqualError(t, err, tt.want)
		})
	}
}

func TestConfigValidateIncludesInstanceTargetPolicy(t *testing.T) {
	t.Parallel()

	cfg := Config{InstanceTargets: InstanceTargetPolicy{AllowedCIDRs: []string{"bad"}}}
	cfg.SetDefaults()

	assert.EqualError(t, cfg.Validate(), `instance_targets: allowed_cidrs[0]: "bad" is not a valid CIDR`)
}

func TestInstanceTargetPolicyLoadsFromConfigFile(t *testing.T) {
	t.Parallel()

	configFile, cleanup := config.CreateTempConfigFile(t, `instance_targets:
  allowed_cidrs:
    - 10.0.0.0/8
    - 2001:db8::/32
  denied_cidrs:
    - 10.10.0.0/16
`, "config.yaml")
	defer cleanup()

	manager, err := config.NewConfigManager(context.Background(), &Config{}, config.WithConfigFile(configFile))
	require.NoError(t, err)
	t.Cleanup(manager.Stop)

	policy := manager.CurrentConfig().InstanceTargets
	assert.Equal(t, []string{"10.0.0.0/8", "2001:db8::/32"}, policy.AllowedCIDRs)
	assert.Equal(t, []string{"10.10.0.0/16"}, policy.DeniedCIDRs)
}
