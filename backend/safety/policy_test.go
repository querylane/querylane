package safety_test

import (
	"context"
	"errors"
	"testing"
	"time"

	"github.com/stretchr/testify/assert"
	"github.com/stretchr/testify/require"
	"google.golang.org/protobuf/types/known/durationpb"

	api "github.com/querylane/querylane/backend/protogen/querylane/console/v1alpha1"
	"github.com/querylane/querylane/backend/resource"
	"github.com/querylane/querylane/backend/safety"
)

type instanceReaderStub struct {
	instance *api.Instance
	err      error
}

func (s instanceReaderStub) GetInstance(context.Context, string) (*api.Instance, error) {
	return s.instance, s.err
}

func TestPolicyDefaultsToReadOnlyWithBoundedStatementTimeout(t *testing.T) {
	t.Parallel()

	tests := []struct {
		name        string
		config      *api.PostgresConfig
		request     time.Duration
		wantAllowed bool
		wantTimeout time.Duration
	}{
		{
			name:        "missing config is safe by default",
			wantTimeout: 30 * time.Second,
		},
		{
			name:        "zero-value config is safe by default",
			config:      &api.PostgresConfig{},
			wantTimeout: 30 * time.Second,
		},
		{
			name: "instance can explicitly allow mutations",
			config: &api.PostgresConfig{
				AllowMutations: true,
			},
			wantAllowed: true,
			wantTimeout: 30 * time.Second,
		},
		{
			name: "instance timeout becomes the default",
			config: &api.PostgresConfig{
				StatementTimeout: duration(12 * time.Second),
			},
			wantTimeout: 12 * time.Second,
		},
		{
			name:        "request override wins",
			config:      &api.PostgresConfig{StatementTimeout: duration(12 * time.Second)},
			request:     4 * time.Second,
			wantTimeout: 4 * time.Second,
		},
		{
			name:        "request override is clamped",
			config:      &api.PostgresConfig{StatementTimeout: duration(12 * time.Second)},
			request:     2 * time.Minute,
			wantTimeout: time.Minute,
		},
	}

	for _, tt := range tests {
		t.Run(tt.name, func(t *testing.T) {
			t.Parallel()

			policy := safety.FromPostgresConfig(tt.config)

			assert.Equal(t, tt.wantAllowed, policy.MutationsAllowed())
			assert.Equal(t, tt.wantTimeout, policy.StatementTimeout(tt.request))
		})
	}
}

func TestGateLoadsServerOwnedInstancePolicy(t *testing.T) {
	t.Parallel()

	instance := resource.NewInstanceName("prod")
	gate := safety.NewGate(instanceReaderStub{instance: &api.Instance{
		Config: &api.PostgresConfig{AllowMutations: true},
	}})

	policy, err := gate.Policy(t.Context(), instance)
	require.NoError(t, err)
	assert.True(t, policy.MutationsAllowed())
}

func TestGatePropagatesInstanceLookupFailure(t *testing.T) {
	t.Parallel()

	wantErr := errors.New("lookup failed")
	gate := safety.NewGate(instanceReaderStub{err: wantErr})

	_, err := gate.Policy(t.Context(), resource.NewInstanceName("prod"))
	assert.ErrorIs(t, err, wantErr)
}

func duration(value time.Duration) *durationpb.Duration {
	return durationpb.New(value)
}
