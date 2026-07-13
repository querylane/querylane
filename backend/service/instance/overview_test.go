package instance

import (
	"context"
	"sync/atomic"
	"testing"
	"time"

	"github.com/stretchr/testify/require"

	"github.com/querylane/querylane/backend/engine"
	"github.com/querylane/querylane/backend/livequery"
	"github.com/querylane/querylane/backend/resource"
)

// stubSessionOpener opens stub sessions and fails like a real opener when the
// fill context is already canceled.
type stubSessionOpener struct {
	opens atomic.Int32
}

func (s *stubSessionOpener) OpenInstance(ctx context.Context, _ resource.InstanceName) (engine.InstanceSession, error) {
	if err := ctx.Err(); err != nil {
		return nil, err
	}

	s.opens.Add(1)

	return &stubInstanceSession{}, nil
}

// stubInstanceSession implements only the methods OverviewProvider exercises.
// The embedded interface panics on anything else, keeping the stub honest.
type stubInstanceSession struct {
	engine.InstanceSession
}

func (s *stubInstanceSession) GetInstanceOverview(ctx context.Context) (*engine.InstanceOverview, error) {
	if err := ctx.Err(); err != nil {
		return nil, err
	}

	return &engine.InstanceOverview{
		Connections: &engine.ConnectionMetrics{Active: 1, Idle: 2, Total: 3},
	}, nil
}

func (s *stubInstanceSession) Close() error { return nil }

func TestOverviewProviderCacheFillSurvivesCallerCancellation(t *testing.T) {
	t.Parallel()

	opener := &stubSessionOpener{}
	provider := NewOverviewProvider(opener)
	instance := resource.NewInstanceName("inst1")

	// A canceled caller must not fail the coalesced cache fill: the fill
	// serves every concurrent and near-future caller, so it has to run
	// decoupled from the first caller's request lifetime.
	canceledCtx, cancel := context.WithCancel(context.Background())
	cancel()

	overview, err := provider.GetInstanceOverview(canceledCtx, instance)
	require.NoError(t, err)
	require.NotNil(t, overview)
	require.Equal(t, int32(3), overview.Connections.Total)

	// The cached value (not a poisoned error) must serve subsequent callers.
	overview, err = provider.GetInstanceOverview(context.Background(), instance)
	require.NoError(t, err)
	require.NotNil(t, overview)
	require.Equal(t, int32(1), opener.opens.Load(), "second caller should hit the cache")
}

type blockingOverviewSession struct {
	engine.InstanceSession

	closes atomic.Int32
}

func (s *blockingOverviewSession) GetInstanceOverview(ctx context.Context) (*engine.InstanceOverview, error) {
	<-ctx.Done()

	return nil, ctx.Err()
}

func (s *blockingOverviewSession) Close() error {
	s.closes.Add(1)

	return nil
}

type blockingOverviewOpener struct {
	session *blockingOverviewSession
}

func (o *blockingOverviewOpener) OpenInstance(context.Context, resource.InstanceName) (engine.InstanceSession, error) {
	return o.session, nil
}

func TestOverviewProviderTimeoutClosesAdmittedSession(t *testing.T) {
	t.Parallel()

	limiter, err := livequery.NewLimiter(1, 1)
	require.NoError(t, err)

	underlying := &blockingOverviewSession{}
	opener := livequery.NewSessionOpener(&blockingOverviewOpener{session: underlying}, limiter)
	provider := NewOverviewProvider(opener)
	provider.fillTimeout = 20 * time.Millisecond
	instance := resource.NewInstanceName("inst1")

	_, err = provider.GetInstanceOverview(t.Context(), instance)
	require.ErrorIs(t, err, context.DeadlineExceeded)
	require.Equal(t, int32(1), underlying.closes.Load())

	release, err := limiter.Acquire(instance)
	require.NoError(t, err, "timed-out fill must release its live-query slot")
	release()
}
