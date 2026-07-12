package runner

import (
	"context"
	"errors"
	"os"
	"sync"
	"testing"
	"time"

	"github.com/stretchr/testify/assert"
	"github.com/stretchr/testify/require"

	"github.com/querylane/querylane/backend/storage"
)

type fakeHeartbeatStore struct {
	mu         sync.Mutex
	beats      []storage.ReplicaHeartbeat
	prunes     int
	upsertErr  error
	beatSignal chan struct{}
}

func newFakeHeartbeatStore() *fakeHeartbeatStore {
	return &fakeHeartbeatStore{beatSignal: make(chan struct{}, 16)}
}

func (f *fakeHeartbeatStore) UpsertHeartbeat(_ context.Context, hb storage.ReplicaHeartbeat) error {
	f.mu.Lock()
	defer f.mu.Unlock()

	if f.upsertErr != nil {
		return f.upsertErr
	}

	f.beats = append(f.beats, hb)
	select {
	case f.beatSignal <- struct{}{}:
	default:
	}

	return nil
}

func (f *fakeHeartbeatStore) PruneStaleReplicas(_ context.Context, _ time.Duration) (int64, error) {
	f.mu.Lock()
	defer f.mu.Unlock()

	f.prunes++

	return 0, nil
}

func (f *fakeHeartbeatStore) snapshot() ([]storage.ReplicaHeartbeat, int) {
	f.mu.Lock()
	defer f.mu.Unlock()

	beats := make([]storage.ReplicaHeartbeat, len(f.beats))
	copy(beats, f.beats)

	return beats, f.prunes
}

func waitForBeat(t *testing.T, store *fakeHeartbeatStore) {
	t.Helper()

	select {
	case <-store.beatSignal:
	case <-time.After(5 * time.Second):
		t.Fatal("timed out waiting for heartbeat")
	}
}

func TestHeartbeaterBeatsImmediatelyAndIdentifiesReplica(t *testing.T) {
	t.Parallel()

	store := newFakeHeartbeatStore()
	// Long interval: only the immediate first beat should fire.
	h := NewHeartbeater("replica-a", store, time.Hour, 24*time.Hour)

	h.Start(t.Context())
	defer h.Close()

	waitForBeat(t, store)

	beats, prunes := store.snapshot()
	require.NotEmpty(t, beats)
	assert.Equal(t, "replica-a", beats[0].ID)
	assert.Equal(t, int64(os.Getpid()), beats[0].PID)
	assert.Equal(t, 1, prunes, "each successful beat prunes opportunistically")

	if hostname, err := os.Hostname(); err == nil {
		assert.Equal(t, hostname, beats[0].Hostname)
	}
}

func TestHeartbeaterKeepsBeating(t *testing.T) {
	t.Parallel()

	store := newFakeHeartbeatStore()
	h := NewHeartbeater("replica-a", store, time.Millisecond, 24*time.Hour)

	h.Start(t.Context())
	defer h.Close()

	waitForBeat(t, store)
	waitForBeat(t, store)
	waitForBeat(t, store)

	beats, _ := store.snapshot()
	assert.GreaterOrEqual(t, len(beats), 3)
}

func TestHeartbeaterSurvivesUpsertFailure(t *testing.T) {
	t.Parallel()

	store := newFakeHeartbeatStore()
	store.upsertErr = errors.New("meta db down")

	h := NewHeartbeater("replica-a", store, time.Millisecond, 24*time.Hour)

	h.Start(t.Context())
	defer h.Close()

	// Let a few failing beats happen, then heal the store: the loop must
	// still be alive and resume beating.
	time.Sleep(10 * time.Millisecond)
	store.mu.Lock()
	store.upsertErr = nil
	store.mu.Unlock()

	waitForBeat(t, store)

	beats, _ := store.snapshot()
	assert.NotEmpty(t, beats)
}

func TestHeartbeaterCloseStopsLoopAndIsIdempotent(t *testing.T) {
	t.Parallel()

	store := newFakeHeartbeatStore()
	h := NewHeartbeater("replica-a", store, time.Millisecond, 24*time.Hour)

	// Close before Start is a no-op.
	h.Close()

	h.Start(t.Context())
	waitForBeat(t, store)
	h.Close()

	beatsAtClose, _ := store.snapshot()

	time.Sleep(10 * time.Millisecond)

	beatsAfter, _ := store.snapshot()
	assert.Len(t, beatsAfter, len(beatsAtClose), "no beats after Close")

	// Second Close is safe.
	h.Close()

	// Start after Close is ignored (startOnce), matching Manager semantics.
	h.Start(t.Context())
	time.Sleep(5 * time.Millisecond)

	beatsRestart, _ := store.snapshot()
	assert.Len(t, beatsRestart, len(beatsAtClose))
}
