package config

import (
	"context"
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
	calls         atomic.Int32
	firstStarted  chan struct{}
	releaseFirst  chan struct{}
	secondStarted chan struct{}
}

func (loader *blockingReloadLoader) Load(context.Context, ...Source) (reloadSequenceConfig, error) {
	call := loader.calls.Add(1)
	if call == 1 {
		close(loader.firstStarted)
		<-loader.releaseFirst
	}

	if call == 2 {
		close(loader.secondStarted)
	}

	return reloadSequenceConfig{revision: int(call)}, nil
}

func TestManager_ReloadsAreSerialized(t *testing.T) {
	t.Parallel()

	loader := &blockingReloadLoader{
		firstStarted:  make(chan struct{}),
		releaseFirst:  make(chan struct{}),
		secondStarted: make(chan struct{}),
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

	secondErr := reload()
	secondOvertookFirst := false

	select {
	case <-loader.secondStarted:
		secondOvertookFirst = true
	case <-time.After(100 * time.Millisecond):
	}

	close(loader.releaseFirst)
	requireTestError(t, firstErr)
	requireTestError(t, secondErr)

	assert.False(t, secondOvertookFirst, "second reload must wait for the first transition")
	assert.Equal(t, 2, manager.CurrentConfig().revision)
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
