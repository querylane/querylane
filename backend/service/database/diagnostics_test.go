package database

import (
	"testing"

	"github.com/stretchr/testify/assert"
	"github.com/stretchr/testify/require"

	"github.com/querylane/querylane/backend/engine"
	api "github.com/querylane/querylane/backend/protogen/querylane/console/v1alpha1"
)

func TestAutovacuumPrioritiesMappingDoesNotInferEligibility(t *testing.T) {
	t.Parallel()
	converted := convertQueryInsightsToProto(&engine.DatabaseQueryInsights{AutovacuumPriorities: &engine.AutovacuumPriorities{Availability: engine.AutovacuumPrioritiesAvailable, Tables: []engine.AutovacuumTablePriority{{SchemaName: "public", TableName: "events", Score: 250, XIDScore: 2, MXIDScore: 3, VacuumScore: 4, VacuumInsertScore: 5, AnalyzeScore: 6, DoVacuum: false, DoAnalyze: true, ForWraparound: false}}}})
	priorities := converted.GetAutovacuumPriorities()
	require.NotNil(t, priorities)
	assert.Equal(t, api.ObservationAvailability_OBSERVATION_AVAILABILITY_AVAILABLE, priorities.GetAvailability())
	require.Len(t, priorities.GetTables(), 1)
	table := priorities.GetTables()[0]
	assert.Equal(t, "events", table.GetTableName())
	assert.InDelta(t, 250, table.GetScore(), 0.001)
	assert.InDelta(t, 5, table.GetVacuumInsertScore(), 0.001)
	assert.False(t, table.GetDoVacuum(), "score alone is not the configurable eligibility threshold")
	assert.True(t, table.GetDoAnalyze())
	assert.Nil(t, autovacuumPrioritiesToProto(nil))
}
