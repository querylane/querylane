package livequery

import (
	"sync"
	"testing"

	"github.com/stretchr/testify/assert"
	"github.com/stretchr/testify/require"

	"github.com/querylane/querylane/backend/resource"
)

func TestLimiterEnforcesPerInstanceAndGlobalLimits(t *testing.T) {
	t.Parallel()

	limiter, err := NewLimiter(3, 2)
	require.NoError(t, err)

	instanceA := resource.NewInstanceName("a")
	instanceB := resource.NewInstanceName("b")

	releaseA1, err := limiter.Acquire(instanceA)
	require.NoError(t, err)
	releaseA2, err := limiter.Acquire(instanceA)
	require.NoError(t, err)

	_, err = limiter.Acquire(instanceA)
	assertLimitExceeded(t, err, ScopeInstance)

	releaseB, err := limiter.Acquire(instanceB)
	require.NoError(t, err)

	_, err = limiter.Acquire(resource.NewInstanceName("c"))
	assertLimitExceeded(t, err, ScopeGlobal)

	releaseA1()
	releaseA2()
	releaseB()

	assert.Equal(t, 0, limiter.active)
	assert.Empty(t, limiter.byInstance)
}

func TestLimiterReleaseIsIdempotent(t *testing.T) {
	t.Parallel()

	limiter, err := NewLimiter(1, 1)
	require.NoError(t, err)

	instance := resource.NewInstanceName("a")
	release, err := limiter.Acquire(instance)
	require.NoError(t, err)

	release()
	release()

	nextRelease, err := limiter.Acquire(instance)
	require.NoError(t, err)
	nextRelease()
}

func TestLimiterConcurrentAcquisitionNeverExceedsLimit(t *testing.T) {
	t.Parallel()

	const limit = 4

	limiter, err := NewLimiter(limit, limit)
	require.NoError(t, err)

	instance := resource.NewInstanceName("a")

	start := make(chan struct{})
	results := make(chan error, limit*4)
	releases := make(chan Release, limit)

	var wg sync.WaitGroup

	for range limit * 4 {
		wg.Go(func() {
			<-start

			release, err := limiter.Acquire(instance)
			if err == nil {
				releases <- release
			}

			results <- err
		})
	}

	close(start)
	wg.Wait()
	close(results)
	close(releases)

	var admitted int

	for err := range results {
		if err == nil {
			admitted++
		}
	}

	assert.Equal(t, limit, admitted)

	for release := range releases {
		release()
	}
}

func TestNewLimiterRejectsInvalidLimits(t *testing.T) {
	t.Parallel()

	tests := []struct {
		name        string
		global      int
		perInstance int
	}{
		{name: "zero global", global: 0, perInstance: 1},
		{name: "zero per instance", global: 1, perInstance: 0},
		{name: "per instance exceeds global", global: 1, perInstance: 2},
	}

	for _, tt := range tests {
		t.Run(tt.name, func(t *testing.T) {
			t.Parallel()

			_, err := NewLimiter(tt.global, tt.perInstance)
			assert.Error(t, err)
		})
	}
}

func assertLimitExceeded(t *testing.T, err error, scope Scope) {
	t.Helper()

	var limitErr *LimitExceededError
	require.ErrorAs(t, err, &limitErr)
	assert.Equal(t, scope, limitErr.Scope)
}
