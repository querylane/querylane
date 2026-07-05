package jobs

import (
	"context"
	"errors"
	"fmt"
	"log/slog"
	"sync"
	"time"

	"github.com/querylane/querylane/backend/engine"
	"github.com/querylane/querylane/backend/resource"
	"github.com/querylane/querylane/backend/runner"
)

// Probes are the sampling routines behind the time-series charts. A probe
// describes what to collect; the job types below own everything around it:
// session opening, version gating, observation timestamps, and failure
// policy. Targets stay opaque AIP resource names, so probes at any level
// (instance, database, or finer-grained resources added later) share the same
// scheduling, leasing, and commit machinery without framework changes.

// InstanceProbe describes one instance-level sampling routine.
type InstanceProbe struct {
	Config runner.Config

	// MinVersion is the minimum server_version_num the probe's queries need
	// (e.g. 160000 for pg_stat_io). Zero means all supported versions.
	MinVersion int32

	// Collect samples the instance and returns the Commit that persists the
	// result. A nil Commit means "nothing to record this cycle".
	Collect func(ctx context.Context, prober engine.InstanceProber, instanceID string, observedAt time.Time) (runner.Commit, error)
}

// DatabaseProbe describes one database-level sampling routine. It differs
// from InstanceProbe only in that the runner additionally opens a session
// into the target database before collecting.
type DatabaseProbe struct {
	Config     runner.Config
	MinVersion int32

	Collect func(ctx context.Context, prober engine.DatabaseProber, dbName resource.DatabaseName, observedAt time.Time) (runner.Commit, error)
}

// instanceProbeJob adapts an InstanceProbe to the Job interface with one
// target per managed instance.
type instanceProbeJob struct {
	probe    InstanceProbe
	sessions InstanceSessionOpener
	source   *InstanceTargetSource
	versions *serverVersionCache
	skips    *capabilitySkipCache
}

// NewInstanceProbeJob returns the Job running probe against every managed
// instance.
func NewInstanceProbeJob(probe InstanceProbe, sessions InstanceSessionOpener, source *InstanceTargetSource) runner.Job {
	return &instanceProbeJob{
		probe:    probe,
		sessions: sessions,
		source:   source,
		versions: newServerVersionCache(),
		skips:    newCapabilitySkipCache(),
	}
}

// Config implements [runner.Job].
func (j *instanceProbeJob) Config() runner.Config { return j.probe.Config }

// ListTargets implements [runner.Job].
func (j *instanceProbeJob) ListTargets(ctx context.Context) ([]string, error) {
	return j.source.ListTargets(ctx)
}

// Run implements [runner.Job].
func (j *instanceProbeJob) Run(ctx context.Context, target string) (runner.RunResult, error) {
	instanceName, err := resource.ParseInstanceName(target)
	if err != nil {
		return runner.RunResult{}, fmt.Errorf("parse instance target: %w", err)
	}

	session, ok := openProbeSession(ctx, j.sessions, j.probe.Config.Name, instanceName)
	if !ok {
		return runner.RunResult{}, nil
	}
	defer session.Close()

	if !j.versions.supports(ctx, session.Prober(), j.probe.Config.Name, instanceName.InstanceID, j.probe.MinVersion) {
		return runner.RunResult{}, nil
	}

	if j.skips.skip(target) {
		return runner.RunResult{}, nil
	}

	commit, err := j.probe.Collect(ctx, session.Prober(), instanceName.InstanceID, time.Now())
	if err != nil {
		j.skips.recordFailure(ctx, j.probe.Config.Name, target, err)
		return runner.RunResult{}, nil
	}

	return runner.RunResult{Commit: commit}, nil
}

// databaseProbeJob adapts a DatabaseProbe to the Job interface with one
// target per known database ("instances/x/databases/y").
type databaseProbeJob struct {
	probe    DatabaseProbe
	sessions InstanceSessionOpener
	source   *DatabaseTargetSource
	versions *serverVersionCache
	skips    *capabilitySkipCache
}

// NewDatabaseProbeJob returns the Job running probe against every known user
// database.
func NewDatabaseProbeJob(probe DatabaseProbe, sessions InstanceSessionOpener, source *DatabaseTargetSource) runner.Job {
	return &databaseProbeJob{
		probe:    probe,
		sessions: sessions,
		source:   source,
		versions: newServerVersionCache(),
		skips:    newCapabilitySkipCache(),
	}
}

// Config implements [runner.Job].
func (j *databaseProbeJob) Config() runner.Config { return j.probe.Config }

// ListTargets implements [runner.Job].
func (j *databaseProbeJob) ListTargets(ctx context.Context) ([]string, error) {
	return j.source.ListTargets(ctx)
}

// Run implements [runner.Job].
func (j *databaseProbeJob) Run(ctx context.Context, target string) (runner.RunResult, error) {
	dbName, err := resource.ParseDatabaseName(target)
	if err != nil {
		return runner.RunResult{}, fmt.Errorf("parse database target: %w", err)
	}

	session, ok := openProbeSession(ctx, j.sessions, j.probe.Config.Name, dbName.Instance())
	if !ok {
		return runner.RunResult{}, nil
	}
	defer session.Close()

	if !j.versions.supports(ctx, session.Prober(), j.probe.Config.Name, dbName.InstanceID, j.probe.MinVersion) {
		return runner.RunResult{}, nil
	}

	if j.skips.skip(target) {
		return runner.RunResult{}, nil
	}

	// Ephemeral: sampling every database through the cached pool path would
	// permanently materialize one pool (and standing idle connection) per
	// database on the user's server.
	dbSession, err := session.Prober().OpenEphemeralDatabase(ctx, dbName.DatabaseID)
	if err != nil {
		// The database may have been dropped since the catalog sync, or the
		// probe role may lack CONNECT — not an infrastructure failure. The
		// target disappears once the catalog catches up.
		slog.DebugContext(ctx, "probe: database session open failed",
			slog.String("probe", j.probe.Config.Name),
			slog.String("target", target),
			slog.String("error", err.Error()))

		return runner.RunResult{}, nil
	}
	defer dbSession.Close()

	commit, err := j.probe.Collect(ctx, dbSession.Prober(), dbName, time.Now())
	if err != nil {
		j.skips.recordFailure(ctx, j.probe.Config.Name, target, err)
		return runner.RunResult{}, nil
	}

	return runner.RunResult{Commit: commit}, nil
}

// openProbeSession opens an instance session, treating failure as the normal
// "instance unreachable" outcome: connectivity is owned by
// InstanceConnectivityJob, so probes record nothing and exit gracefully.
func openProbeSession(ctx context.Context, sessions InstanceSessionOpener, probeName string, instanceName resource.InstanceName) (engine.InstanceSession, bool) {
	session, err := sessions.OpenInstance(ctx, instanceName)
	if err != nil {
		slog.DebugContext(ctx, "probe: session open failed",
			slog.String("probe", probeName),
			slog.String("instance", instanceName.InstanceID),
			slog.String("error", err.Error()))

		return nil, false
	}

	return session, true
}

// serverVersionCacheTTL bounds how long a cached server_version_num is
// trusted. A pool can survive a server upgrade (a fast restart between
// connectivity pings never evicts it), so caching forever could leave a gated
// probe disabled after an upgrade; an hour of staleness only delays the first
// post-upgrade sample.
const serverVersionCacheTTL = time.Hour

// serverVersionCache memoizes per-instance server versions so a gated probe
// asks once an hour instead of once a cycle. One cache per job; database
// probes key by the parent instance so all its databases share one entry.
type serverVersionCache struct {
	mu      sync.Mutex
	entries map[string]serverVersionEntry
}

type serverVersionEntry struct {
	version   int32
	checkedAt time.Time
}

func newServerVersionCache() *serverVersionCache {
	return &serverVersionCache{entries: make(map[string]serverVersionEntry)}
}

// supports reports whether the target server satisfies the probe's version
// gate. Servers below the gate are skipped silently at debug level — that's
// expected fleet heterogeneity, not a failure. Lookup errors are not cached.
func (c *serverVersionCache) supports(ctx context.Context, prober engine.InstanceProber, probeName string, instanceID string, minVersion int32) bool {
	if minVersion <= 0 {
		return true
	}

	c.mu.Lock()
	entry, cached := c.entries[instanceID]
	c.mu.Unlock()

	if !cached || time.Since(entry.checkedAt) > serverVersionCacheTTL {
		version, err := prober.GetServerVersionNum(ctx)
		if err != nil {
			slog.WarnContext(ctx, "probe: server version lookup failed",
				slog.String("probe", probeName),
				slog.String("instance", instanceID),
				slog.String("error", err.Error()))

			return false
		}

		entry = serverVersionEntry{version: version, checkedAt: time.Now()}

		c.mu.Lock()
		c.entries[instanceID] = entry
		c.mu.Unlock()
	}

	if entry.version < minVersion {
		slog.DebugContext(ctx, "probe: server below minimum version",
			slog.String("probe", probeName),
			slog.String("instance", instanceID),
			slog.Int("server_version_num", int(entry.version)),
			slog.Int("min_version_num", int(minVersion)))

		return false
	}

	return true
}

// capabilitySkipTTL bounds how long a target stays skipped after a structural
// failure. Long enough that an incompatible server (a fork missing a stats
// view) is re-probed roughly hourly instead of every cycle, short enough that
// a fixed grant or a schema that gains the view recovers on its own.
const capabilitySkipTTL = time.Hour

// capabilitySkipCache suppresses probes against targets whose server cannot
// satisfy them for a structural reason -- a missing catalog view or function
// on a PostgreSQL-compatible fork -- so an incompatible server is probed once
// an hour instead of failing (and logging) every cycle. Keyed by the full
// target resource name, so it is precise for both instance- and
// database-scoped probes. One cache per job.
type capabilitySkipCache struct {
	mu      sync.Mutex
	skipped map[string]time.Time
}

func newCapabilitySkipCache() *capabilitySkipCache {
	return &capabilitySkipCache{skipped: make(map[string]time.Time)}
}

// skip reports whether target is currently suppressed by a recent structural
// failure. An expired entry is evicted and treated as not skipped so the
// target is retried.
func (c *capabilitySkipCache) skip(target string) bool {
	c.mu.Lock()
	defer c.mu.Unlock()

	skippedAt, ok := c.skipped[target]
	if !ok {
		return false
	}

	if time.Since(skippedAt) > capabilitySkipTTL {
		delete(c.skipped, target)
		return false
	}

	return true
}

// recordFailure classifies a collection failure. A failed collection still
// counts as a successful policy run: the missing rows are the "no data"
// signal, and last_error on the lease row is reserved for infrastructure
// failures. Structural failures (the server lacks the catalog view/function
// the probe needs) are expected fleet heterogeneity, not operator-actionable
// -- they suppress the target for capabilitySkipTTL and log at DEBUG. Every
// other failure is transient (a lock timeout, a momentary permission blip) and
// still logs at WARN every cycle.
func (c *capabilitySkipCache) recordFailure(ctx context.Context, probeName, target string, err error) {
	if errors.Is(err, engine.ErrQueryInvalid) {
		c.mu.Lock()
		c.skipped[target] = time.Now()
		c.mu.Unlock()

		slog.DebugContext(ctx, "probe: target unsupported, suppressing",
			slog.String("probe", probeName),
			slog.String("target", target),
			slog.Duration("retry_after", capabilitySkipTTL),
			slog.String("error", err.Error()))

		return
	}

	slog.WarnContext(ctx, "probe: collection failed",
		slog.String("probe", probeName),
		slog.String("target", target),
		slog.String("error", err.Error()))
}
