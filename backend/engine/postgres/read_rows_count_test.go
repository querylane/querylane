package postgres

import (
	"testing"

	"github.com/stretchr/testify/assert"

	api "github.com/querylane/querylane/backend/protogen/querylane/console/v1alpha1"
)

func TestBuildExactRowCountFromStats(t *testing.T) {
	t.Parallel()

	tests := []struct {
		name       string
		stats      rowCountStats
		wantStatus api.RowCount_Status
		wantValue  int64
	}{
		{
			name: "uses estimate when estimate exceeds threshold",
			stats: rowCountStats{
				estimate: exactRowCountEstimateThreshold + 1,
				relkind:  "r",
			},
			wantStatus: api.RowCount_STATUS_ESTIMATED,
			wantValue:  exactRowCountEstimateThreshold + 1,
		},
		{
			name: "declines foreign tables",
			stats: rowCountStats{
				estimate: 10,
				relkind:  postgresRelkindForeignTable,
			},
			wantStatus: api.RowCount_STATUS_UNAVAILABLE,
			wantValue:  0,
		},
	}

	for _, tt := range tests {
		t.Run(tt.name, func(t *testing.T) {
			t.Parallel()

			rowCount := buildExactRowCountFromStats(tt.stats)

			assert.Equal(t, tt.wantStatus, rowCount.GetStatus())
			assert.Equal(t, tt.wantValue, rowCount.GetValue())
		})
	}
}
