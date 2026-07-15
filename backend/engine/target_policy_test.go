package engine

import (
	"context"
	"errors"
	"net"
	"net/netip"
	"testing"

	"github.com/jackc/pgx/v5"
	"github.com/stretchr/testify/assert"
	"github.com/stretchr/testify/require"
)

func TestTargetPolicyDefaultBlocksUnsafeDestinations(t *testing.T) {
	t.Parallel()

	policy, err := NewTargetPolicy(nil, nil)
	require.NoError(t, err)

	for _, raw := range []string{
		"0.0.0.0",
		"169.254.169.254",
		"fd00:ec2::254",
		"::",
		"fe80::1",
	} {
		t.Run(raw, func(t *testing.T) {
			t.Parallel()

			err := policy.Check(netip.MustParseAddr(raw))
			require.ErrorIs(t, err, ErrTargetNotAllowed)
		})
	}
}

func TestTargetPolicyDefaultAllowsLoopbackPrivateAndPublicDestinations(t *testing.T) {
	t.Parallel()

	policy, err := NewTargetPolicy(nil, nil)
	require.NoError(t, err)

	for _, raw := range []string{
		"127.0.0.1",
		"::1",
		"::ffff:127.0.0.1",
		"10.0.0.1",
		"172.16.0.1",
		"192.168.0.1",
		"8.8.8.8",
		"2001:db8::1",
	} {
		t.Run(raw, func(t *testing.T) {
			t.Parallel()
			require.NoError(t, policy.Check(netip.MustParseAddr(raw)))
		})
	}
}

func TestTargetPolicyExplicitAllowlistRestrictsAndOverridesDefaults(t *testing.T) {
	t.Parallel()

	policy, err := NewTargetPolicy([]string{"127.0.0.0/8", "10.20.0.0/16"}, nil)
	require.NoError(t, err)

	assert.True(t, policy.HasExplicitAllowlist())
	require.NoError(t, policy.Check(netip.MustParseAddr("127.0.0.1")))
	require.NoError(t, policy.Check(netip.MustParseAddr("10.20.30.40")))
	require.ErrorIs(t, policy.Check(netip.MustParseAddr("10.21.0.1")), ErrTargetNotAllowed)
	require.ErrorIs(t, policy.Check(netip.MustParseAddr("8.8.8.8")), ErrTargetNotAllowed)
}

func TestTargetPolicyCustomDenyWinsOverAllowlist(t *testing.T) {
	t.Parallel()

	policy, err := NewTargetPolicy([]string{"10.0.0.0/8"}, []string{"10.10.0.0/16"})
	require.NoError(t, err)

	require.NoError(t, policy.Check(netip.MustParseAddr("10.9.0.1")))
	require.ErrorIs(t, policy.Check(netip.MustParseAddr("10.10.0.1")), ErrTargetNotAllowed)
}

func TestApplyTargetPolicyChecksResolvedAddressBeforeDial(t *testing.T) {
	t.Parallel()

	policy, err := NewTargetPolicy(nil, nil)
	require.NoError(t, err)

	cfg, err := pgx.ParseConfig("postgres://postgres:secret@db.example.com/postgres")
	require.NoError(t, err)

	wantDialErr := errors.New("dial reached")
	dialCalls := 0
	cfg.DialFunc = func(context.Context, string, string) (net.Conn, error) {
		dialCalls++

		return nil, wantDialErr
	}
	applyTargetPolicy(cfg, policy)

	_, err = cfg.DialFunc(t.Context(), "tcp", "169.254.169.254:5432")
	require.ErrorIs(t, err, ErrTargetNotAllowed)
	assert.Zero(t, dialCalls)

	_, err = cfg.DialFunc(t.Context(), "tcp", "127.0.0.1:5432")
	require.ErrorIs(t, err, wantDialErr)
	assert.Equal(t, 1, dialCalls)
}
