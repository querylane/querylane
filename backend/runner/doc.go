// Package runner schedules background [Job]s across replicas. It owns the
// hard parts so job code never has to: per-target leases in
// runner_execution_state, claim and reclaim semantics, and pairing each
// successful Commit with its execution bookkeeping in a single meta-DB
// transaction (so results and "done" state can never disagree).
//
// The package knows nothing about what jobs collect — the concrete payloads
// (metric probes, connectivity checks, retention) live in runner/jobs. A Job
// only lists its targets, runs collection, and returns a Commit closure; the
// Manager does everything else.
//
// Config.Name is the distributed lease key. It must stay stable across
// restarts and releases, or a renamed job forgets its execution history and
// reruns immediately on every replica.
package runner
