// Package jobs contains every [runner.Job] the server schedules: the metric
// probes behind the time-series charts, the instance connectivity check, and
// sample retention. Leasing, claim coordination, and commit-transaction
// pairing are the runner package's problem — code here only lists targets,
// collects, and returns a runner.Commit.
//
// To add a probe, define an [InstanceProbe] or [DatabaseProbe] (usually a
// constructor in probes.go wrapping it via NewInstanceProbeJob /
// NewDatabaseProbeJob) and wire it in cmd/server. The adapters own session
// opening, server-version gating, and collection-failure policy.
//
// Target-listing policy is job policy, not harness policy: the target sources
// here decide which discovery failures skip one instance (a broken instance
// must not starve sampling for the rest) and which abort the cycle (caller
// cancellation — see DatabaseTargetSource.ListTargets).
package jobs
