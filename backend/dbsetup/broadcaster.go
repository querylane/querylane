// Package dbsetup provides types and utilities for reporting database setup
// progress. It is imported by both cmd/server (Application) and
// service/onboarding to avoid circular dependencies.
package dbsetup

import "sync"

// StepID identifies a phase in the database setup pipeline.
type StepID string

const (
	StepStartingEmbedded     StepID = "starting_embedded"
	StepConnecting           StepID = "connecting"
	StepMigrating            StepID = "migrating"
	StepInitializingServices StepID = "initializing_services"
	StepPersistingConfig     StepID = "persisting_config"
	StepWaitingForConfig     StepID = "waiting_for_config"
	StepConfigDetected       StepID = "config_detected"
)

// DisplayName returns the human-readable label for a step.
func (s StepID) DisplayName() string {
	switch s {
	case StepStartingEmbedded:
		return "Starting embedded PostgreSQL"
	case StepConnecting:
		return "Connecting to PostgreSQL"
	case StepMigrating:
		return "Running migrations"
	case StepInitializingServices:
		return "Initializing services"
	case StepPersistingConfig:
		return "Saving configuration"
	case StepWaitingForConfig:
		return "Waiting for configuration"
	case StepConfigDetected:
		return "Configuration detected"
	default:
		return string(s)
	}
}

// StepState represents the lifecycle state of a single setup step.
type StepState int

const (
	StatePending    StepState = iota // Step has not started yet.
	StateInProgress                  // Step is currently executing.
	StateSucceeded                   // Step completed successfully.
	StateFailed                      // Step failed.
)

// ProgressEvent carries the state of a single setup step.
type ProgressEvent struct {
	StepID      StepID
	DisplayName string
	State       StepState
	Error       string
}

// NewEvent creates a ProgressEvent with DisplayName derived from the StepID.
func NewEvent(id StepID, state StepState) ProgressEvent {
	return ProgressEvent{
		StepID:      id,
		DisplayName: id.DisplayName(),
		State:       state,
	}
}

// NewErrorEvent creates a failed ProgressEvent with an error message.
func NewErrorEvent(id StepID, err string) ProgressEvent {
	return ProgressEvent{
		StepID:      id,
		DisplayName: id.DisplayName(),
		State:       StateFailed,
		Error:       err,
	}
}

// Broadcaster fans out progress events to all registered subscribers.
// Callbacks are invoked synchronously under a read lock so that subscribers
// that need async delivery should use a buffered channel inside their callback.
type Broadcaster struct {
	mu   sync.RWMutex
	subs map[uint32]func(ProgressEvent)
	next uint32
}

// NewBroadcaster creates a ready-to-use Broadcaster.
func NewBroadcaster() *Broadcaster {
	return &Broadcaster{
		subs: make(map[uint32]func(ProgressEvent)),
	}
}

// SubscribeChan creates a buffered channel and subscribes it to this
// broadcaster. Returns the channel and a subscription ID for Unsubscribe.
// Events are dropped (not blocking the broadcaster) if the channel buffer
// is full.
func (b *Broadcaster) SubscribeChan(bufSize int) (<-chan ProgressEvent, uint32) {
	ch := make(chan ProgressEvent, bufSize)
	id := b.Subscribe(func(e ProgressEvent) {
		select {
		case ch <- e:
		default:
		}
	})

	return ch, id
}

// Subscribe registers a callback and returns its subscription ID.
func (b *Broadcaster) Subscribe(fn func(ProgressEvent)) uint32 {
	b.mu.Lock()
	defer b.mu.Unlock()

	b.next++
	id := b.next
	b.subs[id] = fn

	return id
}

// Unsubscribe removes a previously registered subscription.
func (b *Broadcaster) Unsubscribe(id uint32) {
	b.mu.Lock()
	defer b.mu.Unlock()

	delete(b.subs, id)
}

// Send delivers an event to every subscriber synchronously.
func (b *Broadcaster) Send(e ProgressEvent) {
	b.mu.RLock()
	defer b.mu.RUnlock()

	for _, fn := range b.subs {
		fn(e)
	}
}
