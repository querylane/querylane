package instance

import (
	"fmt"
	"testing"
	"time"

	"connectrpc.com/connect"
	"github.com/stretchr/testify/assert"
	"github.com/stretchr/testify/require"
)

func TestConnectionTestLimiterAppliesPerCallerTokenBuckets(t *testing.T) {
	t.Parallel()

	now := time.Date(2026, time.July, 14, 12, 0, 0, 0, time.UTC)
	limiter, err := newConnectionTestLimiter(2, 1, func() time.Time { return now })
	require.NoError(t, err)

	require.NoError(t, limiter.Allow("192.0.2.1"))
	require.ErrorIs(t, limiter.Allow("192.0.2.1"), errConnectionTestRateLimitExceeded)
	require.NoError(t, limiter.Allow("192.0.2.2"))

	now = now.Add(30 * time.Second)

	require.NoError(t, limiter.Allow("192.0.2.1"))
}

func TestConnectionTestCallerCanonicalizesSocketAddress(t *testing.T) {
	t.Parallel()

	tests := map[string]string{
		"192.0.2.1:1234":            "192.0.2.1",
		"[2001:db8::1]:1234":        "2001:db8::1",
		"[::ffff:192.0.2.1]:1234":   "192.0.2.1",
		"":                          "unknown",
		"not-a-socket-address:1234": "not-a-socket-address",
	}

	for addr, want := range tests {
		assert.Equal(t, want, connectionTestCaller(addr))
	}
}

func TestConnectionTestLimiterBoundsCallerState(t *testing.T) {
	t.Parallel()

	now := time.Date(2026, time.July, 14, 12, 0, 0, 0, time.UTC)
	limiter, err := newConnectionTestLimiter(10_000, 10_000, func() time.Time { return now })
	require.NoError(t, err)

	for i := range maxConnectionTestCallerBuckets + 100 {
		require.NoError(t, limiter.Allow(fmt.Sprintf("192.0.2.%d", i)))
	}

	assert.LessOrEqual(t, len(limiter.callers), maxConnectionTestCallerBuckets+1)
}

func TestConnectionTestGuardReturnsStableRateLimitError(t *testing.T) {
	t.Parallel()

	guard, err := NewConnectionTestGuard(1, 1, false)
	require.NoError(t, err)
	require.NoError(t, guard.admit("192.0.2.1:1234"))

	err = guard.admit("192.0.2.1:4321")
	require.Error(t, err)

	var connectErr *connect.Error
	require.ErrorAs(t, err, &connectErr)
	assert.Equal(t, connect.CodeResourceExhausted, connectErr.Code())
	assert.Equal(t, "Too many connection attempts. Try again later.", connectErr.Message())
	assert.Equal(t, "CONNECTION_TEST_RATE_LIMIT_EXCEEDED", requireConnectionErrorInfo(t, connectErr).Reason)
}
