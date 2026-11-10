package database

import (
	"github.com/querylane/querylane/backend/engine"
	api "github.com/querylane/querylane/backend/protogen/querylane/console/v1alpha1"
	"github.com/querylane/querylane/backend/service/internal/pgconv"
)

func autovacuumPrioritiesToProto(priorities *engine.AutovacuumPriorities) *api.AutovacuumPriorities {
	if priorities == nil {
		return nil
	}
	result := &api.AutovacuumPriorities{Availability: pgconv.ObservationAvailabilityToProto(string(priorities.Availability)), Summary: priorities.Summary}
	for _, table := range priorities.Tables {
		result.Tables = append(result.Tables, &api.AutovacuumTablePriority{SchemaName: table.SchemaName, TableName: table.TableName, Score: table.Score, XidScore: table.XIDScore, MxidScore: table.MXIDScore, VacuumScore: table.VacuumScore, VacuumInsertScore: table.VacuumInsertScore, AnalyzeScore: table.AnalyzeScore, DoVacuum: table.DoVacuum, DoAnalyze: table.DoAnalyze, ForWraparound: table.ForWraparound})
	}
	return result
}
