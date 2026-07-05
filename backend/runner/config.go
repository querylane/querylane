package runner

import "time"

// Config holds the static scheduling and identity parameters for a job.
type Config struct {
	// Name uniquely identifies this job. It is used as part of the distributed
	// lease key, so it must be stable across restarts (e.g. "instance_connectivity").
	Name string

	// Interval is the pause between full cycles. After completing one cycle the
	// Manager waits this long before listing targets and running again.
	Interval time.Duration

	// LeaseDuration controls both the target lease duration and the per-target run
	// deadline. It should be comfortably longer than the expected collection plus
	// persistence time for one target.
	LeaseDuration time.Duration

	// Concurrency is the maximum number of targets processed in parallel within a
	// single cycle. Minimum effective value is 1.
	Concurrency int
}
