package dbsetup_test

import (
	"sync"
	"testing"

	"github.com/stretchr/testify/assert"
	"github.com/stretchr/testify/require"

	"github.com/querylane/querylane/backend/dbsetup"
)

func TestBroadcaster(t *testing.T) {
	t.Parallel()

	t.Run("delivers events to all subscribers", func(t *testing.T) {
		t.Parallel()

		bc := dbsetup.NewBroadcaster()

		var (
			mu       sync.Mutex
			received []dbsetup.ProgressEvent
		)

		bc.Subscribe(func(e dbsetup.ProgressEvent) {
			mu.Lock()
			defer mu.Unlock()

			received = append(received, e)
		})
		bc.Subscribe(func(e dbsetup.ProgressEvent) {
			mu.Lock()
			defer mu.Unlock()

			received = append(received, e)
		})

		evt := dbsetup.ProgressEvent{
			StepID:      dbsetup.StepConnecting,
			DisplayName: "Connecting to PostgreSQL",
			State:       dbsetup.StateInProgress,
		}
		bc.Send(evt)

		mu.Lock()
		defer mu.Unlock()

		assert.Len(t, received, 2)
		assert.Equal(t, evt, received[0])
		assert.Equal(t, evt, received[1])
	})

	t.Run("unsubscribe stops delivery", func(t *testing.T) {
		t.Parallel()

		bc := dbsetup.NewBroadcaster()

		called := false
		id := bc.Subscribe(func(_ dbsetup.ProgressEvent) {
			called = true
		})

		bc.Unsubscribe(id)
		bc.Send(dbsetup.ProgressEvent{StepID: dbsetup.StepConnecting, State: dbsetup.StateInProgress})

		assert.False(t, called)
	})

	t.Run("no subscribers does not panic", func(t *testing.T) {
		t.Parallel()

		bc := dbsetup.NewBroadcaster()

		require.NotPanics(t, func() {
			bc.Send(dbsetup.ProgressEvent{StepID: dbsetup.StepMigrating, State: dbsetup.StatePending})
		})
	})

	t.Run("subscription IDs are unique", func(t *testing.T) {
		t.Parallel()

		bc := dbsetup.NewBroadcaster()

		id1 := bc.Subscribe(func(_ dbsetup.ProgressEvent) {})
		id2 := bc.Subscribe(func(_ dbsetup.ProgressEvent) {})

		assert.NotEqual(t, id1, id2)
	})

	t.Run("SubscribeChan delivers events on channel", func(t *testing.T) {
		t.Parallel()

		bc := dbsetup.NewBroadcaster()

		ch, subID := bc.SubscribeChan(4)
		defer bc.Unsubscribe(subID)

		evt := dbsetup.NewEvent(dbsetup.StepConnecting, dbsetup.StateInProgress)
		bc.Send(evt)

		received := <-ch
		assert.Equal(t, evt, received)
	})

	t.Run("SubscribeChan drops events when buffer is full", func(t *testing.T) {
		t.Parallel()

		bc := dbsetup.NewBroadcaster()

		ch, subID := bc.SubscribeChan(1)
		defer bc.Unsubscribe(subID)

		// Fill the buffer.
		bc.Send(dbsetup.NewEvent(dbsetup.StepConnecting, dbsetup.StateInProgress))
		// This should be dropped (buffer full).
		bc.Send(dbsetup.NewEvent(dbsetup.StepMigrating, dbsetup.StateInProgress))

		received := <-ch
		assert.Equal(t, dbsetup.StepConnecting, received.StepID)

		// Channel should be empty now.
		select {
		case <-ch:
			t.Fatal("expected channel to be empty")
		default:
		}
	})

	t.Run("SubscribeChan preserves terminal failure when buffer is full", func(t *testing.T) {
		t.Parallel()

		bc := dbsetup.NewBroadcaster()

		ch, subID := bc.SubscribeChan(1)
		defer bc.Unsubscribe(subID)

		bc.Send(dbsetup.NewEvent(dbsetup.StepConnecting, dbsetup.StateInProgress))
		failure := dbsetup.NewErrorEvent(dbsetup.StepConnecting, "connection refused")
		bc.Send(failure)

		assert.Equal(t, failure, <-ch)
	})
}

func TestNewEvent(t *testing.T) {
	t.Parallel()

	evt := dbsetup.NewEvent(dbsetup.StepMigrating, dbsetup.StateInProgress)

	assert.Equal(t, dbsetup.StepMigrating, evt.StepID)
	assert.Equal(t, "Running migrations", evt.DisplayName)
	assert.Equal(t, dbsetup.StateInProgress, evt.State)
	assert.Empty(t, evt.Error)
}

func TestNewErrorEvent(t *testing.T) {
	t.Parallel()

	evt := dbsetup.NewErrorEvent(dbsetup.StepConnecting, "connection refused")

	assert.Equal(t, dbsetup.StepConnecting, evt.StepID)
	assert.Equal(t, "Connecting to PostgreSQL", evt.DisplayName)
	assert.Equal(t, dbsetup.StateFailed, evt.State)
	assert.Equal(t, "connection refused", evt.Error)
}

func TestStepID_DisplayName(t *testing.T) {
	t.Parallel()

	tests := []struct {
		name     string
		stepID   dbsetup.StepID
		expected string
	}{
		{name: "starting_embedded", stepID: dbsetup.StepStartingEmbedded, expected: "Starting embedded PostgreSQL"},
		{name: "connecting", stepID: dbsetup.StepConnecting, expected: "Connecting to PostgreSQL"},
		{name: "migrating", stepID: dbsetup.StepMigrating, expected: "Running migrations"},
		{name: "initializing_services", stepID: dbsetup.StepInitializingServices, expected: "Initializing services"},
		{name: "persisting_config", stepID: dbsetup.StepPersistingConfig, expected: "Saving configuration"},
		{name: "waiting_for_config", stepID: dbsetup.StepWaitingForConfig, expected: "Waiting for configuration"},
		{name: "config_detected", stepID: dbsetup.StepConfigDetected, expected: "Configuration detected"},
		{name: "unknown", stepID: dbsetup.StepID("unknown"), expected: "unknown"},
	}

	for _, tt := range tests {
		t.Run(tt.name, func(t *testing.T) {
			t.Parallel()
			assert.Equal(t, tt.expected, tt.stepID.DisplayName())
		})
	}
}
