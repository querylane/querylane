package config

import (
	"context"
	"sync"
	"sync/atomic"
	"testing"
	"time"

	"github.com/stretchr/testify/assert"
	"github.com/stretchr/testify/require"
)

type reloadSequenceConfig struct {
	revision int
}

func (reloadSequenceConfig) SetDefaults() {}

func (reloadSequenceConfig) Validate() error { return nil }

func (reloadSequenceConfig) OnLoadingComplete(context.Context) {}

type blockingReloadLoader struct {
	calls        atomic.Int32
	firstStarted chan struct{}
	releaseFirst chan struct{}
}

func (loader *blockingReloadLoader) Load(context.Context, ...Source) (reloadSequenceConfig, error) {
	call := loader.calls.Add(1)
	if call == 1 {
		close(loader.firstStarted)
		<-loader.releaseFirst
	}

	return reloadSequenceConfig{revision: int(call)}, nil
}

func TestManager_ReloadsAreSerialized(t *testing.T) {
	t.Parallel()

	loader := &blockingReloadLoader{
		firstStarted: make(chan struct{}),
		releaseFirst: make(chan struct{}),
	}
	manager := &Manager[reloadSequenceConfig]{
		loader:        loader,
		defaultConfig: reloadSequenceConfig{},
		options:       &Options{},
		subscribers:   make(map[uint32]*changeSubscriber[reloadSequenceConfig]),
	}
	initial := reloadSequenceConfig{}
	manager.currentConfig.Store(&initial)

	reload := func() <-chan error {
		errCh := make(chan error, 1)

		go func() {
			errCh <- manager.reloadConfiguration(context.Background())
		}()

		return errCh
	}

	firstErr := reload()

	requireTestSignal(t, loader.firstStarted, "first reload did not start")

	secondAttempted := make(chan struct{})
	secondErr := make(chan error, 1)

	go func() {
		close(secondAttempted)

		secondErr <- manager.reloadConfiguration(context.Background())
	}()

	requireTestSignal(t, secondAttempted, "second reload did not reach the manager")

	reloadLockHeld := !manager.reloadMu.TryLock()
	if !reloadLockHeld {
		manager.reloadMu.Unlock()
	}

	close(loader.releaseFirst)
	requireTestError(t, firstErr)
	requireTestError(t, secondErr)

	assert.True(t, reloadLockHeld, "reload lock must cover the full configuration transition")
	assert.Equal(t, 2, manager.CurrentConfig().revision)
}

func TestChangeSubscriber_QueuesChangesDuringCallback(t *testing.T) {
	t.Parallel()

	firstStarted := make(chan struct{})
	releaseFirst := make(chan struct{})
	secondFinished := make(chan struct{})

	var (
		mu    sync.Mutex
		trace []int
	)

	subscriber := &changeSubscriber[int]{callback: func(_, newConfig int) {
		if newConfig == 1 {
			close(firstStarted)
			<-releaseFirst
		}

		mu.Lock()

		trace = append(trace, newConfig)
		mu.Unlock()

		if newConfig == 2 {
			close(secondFinished)
		}
	}}

	subscriber.enqueue(0, 1)
	requireTestSignal(t, firstStarted, "first notification did not start")
	subscriber.enqueue(1, 2)

	subscriber.mu.Lock()
	dispatching := subscriber.dispatching
	pending := append([]configChange[int](nil), subscriber.pending...)
	subscriber.mu.Unlock()

	assert.True(t, dispatching)
	require.Len(t, pending, 1)
	assert.Equal(t, configChange[int]{oldConfig: 1, newConfig: 2}, pending[0])

	close(releaseFirst)
	requireTestSignal(t, secondFinished, "second notification did not finish")

	mu.Lock()
	assert.Equal(t, []int{1, 2}, trace)
	mu.Unlock()
}

func TestChangeSubscribersRunIndependently(t *testing.T) {
	t.Parallel()

	blockedStarted := make(chan struct{})
	releaseBlocked := make(chan struct{})
	independentStarted := make(chan struct{})

	blocked := &changeSubscriber[int]{callback: func(_, _ int) {
		close(blockedStarted)
		<-releaseBlocked
	}}
	independent := &changeSubscriber[int]{callback: func(_, _ int) {
		close(independentStarted)
	}}

	blocked.enqueue(0, 1)
	requireTestSignal(t, blockedStarted, "blocked subscriber did not start")
	independent.enqueue(0, 1)
	requireTestSignal(t, independentStarted, "independent subscriber was blocked")
	close(releaseBlocked)
}

func TestChangeSubscriber_PanicDoesNotStopQueue(t *testing.T) {
	t.Parallel()

	firstStarted := make(chan struct{})
	releasePanic := make(chan struct{})
	secondStarted := make(chan struct{})
	subscriber := &changeSubscriber[int]{callback: func(_, newConfig int) {
		if newConfig == 1 {
			close(firstStarted)
			<-releasePanic
			panic("test panic") //nolint:forbidigo // exercises subscriber panic recovery
		}

		close(secondStarted)
	}}

	subscriber.enqueue(0, 1)
	requireTestSignal(t, firstStarted, "first notification did not start")
	subscriber.enqueue(1, 2)
	close(releasePanic)
	requireTestSignal(t, secondStarted, "panic stopped queued notification")
}

func requireTestSignal(t *testing.T, signal <-chan struct{}, message string) {
	t.Helper()

	select {
	case <-signal:
	case <-time.After(time.Second):
		t.Fatal(message)
	}
}

func requireTestError(t *testing.T, errCh <-chan error) {
	t.Helper()

	select {
	case err := <-errCh:
		require.NoError(t, err)
	case <-time.After(time.Second):
		t.Fatal("timed out waiting for reload")
	}
}
