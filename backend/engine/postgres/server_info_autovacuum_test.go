package postgres

import (
	"testing"
	"time"

	"github.com/stretchr/testify/assert"

	"github.com/querylane/querylane/backend/engine"
)

func TestSummarizeAutovacuum(t *testing.T) {
	t.Parallel()

	if !testing.Short() {
		t.Skip("unit test: run with -short")
	}

	recent := time.Now().Add(-18 * time.Minute)

	tests := []struct {
		name            string
		health          engine.AutovacuumHealth
		wantStatus      engine.HealthStatus
		wantSummaryPart string
	}{
		{
			name: "workers-available-is-ok",
			health: engine.AutovacuumHealth{
				RunningWorkers:   1,
				MaxWorkers:       3,
				LastAutovacuumAt: &recent,
			},
			wantStatus:      engine.HealthStatusOK,
			wantSummaryPart: "1 of 3 workers active; last ran",
		},
		{
			name: "all-workers-busy-warns",
			health: engine.AutovacuumHealth{
				RunningWorkers:   3,
				MaxWorkers:       3,
				LastAutovacuumAt: &recent,
			},
			wantStatus:      engine.HealthStatusWarning,
			wantSummaryPart: "3 of 3 workers active",
		},
		{
			name: "null-last-autovacuum-reported-not-warned",
			health: engine.AutovacuumHealth{
				RunningWorkers: 0,
				MaxWorkers:     3,
			},
			wantStatus:      engine.HealthStatusOK,
			wantSummaryPart: "no autovacuum recorded yet",
		},
		{
			name: "unknown-max-workers-is-unknown",
			health: engine.AutovacuumHealth{
				RunningWorkers: 0,
				MaxWorkers:     0,
			},
			wantStatus:      engine.HealthStatusUnknown,
			wantSummaryPart: "autovacuum_max_workers",
		},
	}

	for _, tt := range tests {
		t.Run(tt.name, func(t *testing.T) {
			t.Parallel()

			status, summary := summarizeAutovacuum(tt.health)

			assert.Equal(t, tt.wantStatus, status)
			assert.Contains(t, summary, tt.wantSummaryPart)
		})
	}
}

func TestHumanizeDuration(t *testing.T) {
	t.Parallel()

	if !testing.Short() {
		t.Skip("unit test: run with -short")
	}

	tests := []struct {
		name string
		d    time.Duration
		want string
	}{
		{name: "negative-clamps-to-zero", d: -5 * time.Second, want: "0s"},
		{name: "seconds", d: 42 * time.Second, want: "42s"},
		{name: "minutes", d: 18 * time.Minute, want: "18m"},
		{name: "hours", d: 5 * time.Hour, want: "5h"},
		{name: "days", d: 50 * time.Hour, want: "2d"},
	}

	for _, tt := range tests {
		t.Run(tt.name, func(t *testing.T) {
			t.Parallel()

			assert.Equal(t, tt.want, humanizeDuration(tt.d))
		})
	}
}
