package runner

import (
	"context"
	"log/slog"
	"os"
	"sync"
	"time"

	"github.com/querylane/querylane/backend/storage"
)

type heartbeatStore interface {
	UpsertHeartbeat(ctx context.Context, hb storage.ReplicaHeartbeat) error
	PruneStaleReplicas(ctx context.Context, age time.Duration) (int64, error)
}

// Heartbeater keeps this replica's row in the replica registry fresh. Unlike
// Jobs it is not lease-gated: every replica beats, so the registry lists the
// whole fleet, including replicas that currently hold zero leases.
type Heartbeater struct {
	replicaID string
	store     heartbeatStore
	interval  time.Duration
	pruneAge  time.Duration

	startOnce sync.Once
	cancel    context.CancelFunc
	wg        sync.WaitGroup
}

// NewHeartbeater returns a Heartbeater for this replica. replicaID must be
// the same lease-owner token the runner Manager uses, so replica rows join
// against runner_execution_state.lease_owner.
func NewHeartbeater(replicaID string, store heartbeatStore, interval, pruneAge time.Duration) *Heartbeater {
	return &Heartbeater{
		replicaID: replicaID,
		store:     store,
		interval:  interval,
		pruneAge:  pruneAge,
	}
}

// Start launches the heartbeat loop. The first beat runs immediately so the
// replica is visible in ListReplicas right after boot. Calling Start more
// than once is a no-op.
func (h *Heartbeater) Start(ctx context.Context) {
	h.startOnce.Do(func() {
		runCtx, cancel := context.WithCancel(ctx)
		h.cancel = cancel

		h.wg.Go(func() {
			h.runLoop(runCtx)
		})
	})
}

// Close stops the heartbeat loop and blocks until it exits. Safe to call
// before Start (no-op) and idempotent.
func (h *Heartbeater) Close() {
	if h.cancel != nil {
		h.cancel()
	}

	h.wg.Wait()
}

func (h *Heartbeater) runLoop(ctx context.Context) {
	hostname, err := os.Hostname()
	if err != nil {
		slog.Warn("replica heartbeat: hostname unavailable", slog.Any("error", err))
	}

	hb := storage.ReplicaHeartbeat{
		ID:       h.replicaID,
		Hostname: hostname,
		PID:      int64(os.Getpid()),
	}

	ticker := time.NewTicker(h.interval)
	defer ticker.Stop()

	for {
		// A tick can race shutdown; check before every beat (same rationale
		// as Manager.runLoop).
		if ctx.Err() != nil {
			return
		}

		h.beat(ctx, hb)

		select {
		case <-ctx.Done():
			return
		case <-ticker.C:
		}
	}
}

// beat upserts this replica's row and opportunistically prunes long-dead
// rows. Both are idempotent across replicas, so every replica doing them is
// harmless. Failures are logged and the loop keeps going: a meta-DB outage
// already surfaces through the DB gate, and the next beat retries anyway.
func (h *Heartbeater) beat(ctx context.Context, hb storage.ReplicaHeartbeat) {
	if err := h.store.UpsertHeartbeat(ctx, hb); err != nil {
		if ctx.Err() == nil {
			slog.Warn("replica heartbeat failed", slog.Any("error", err))
		}

		return
	}

	if _, err := h.store.PruneStaleReplicas(ctx, h.pruneAge); err != nil && ctx.Err() == nil {
		slog.Warn("replica registry prune failed", slog.Any("error", err))
	}
}
