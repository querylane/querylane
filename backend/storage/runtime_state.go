package storage

import (
	"context"
	"database/sql"
	"fmt"
	"time"

	"github.com/go-jet/jet/v2/postgres"

	modelgen "github.com/querylane/querylane/backend/storage/gen/querylane/public/model"
	"github.com/querylane/querylane/backend/storage/gen/querylane/public/table"
)

// InstanceRuntimeState stores the latest shared runtime view for an instance.
type InstanceRuntimeState struct {
	InstanceID          string
	ConnectionState     modelgen.ConnectionState
	ConnectionError     *string
	ConnectionCheckedAt *time.Time
	CreatedAt           time.Time
	UpdatedAt           time.Time
}

// InstanceRuntimeStateReader provides shared runtime-state reads for instances.
type InstanceRuntimeStateReader interface {
	ListInstanceRuntimeStates(ctx context.Context, instanceIDs []string) (map[string]InstanceRuntimeState, error)
}

type PGInstanceRuntimeStateStore struct {
	db *sql.DB
}

// NewInstanceRuntimeStateStore returns a store backed by db.
func NewInstanceRuntimeStateStore(db *sql.DB) *PGInstanceRuntimeStateStore {
	return &PGInstanceRuntimeStateStore{db: db}
}

// ListInstanceRuntimeStates returns the latest connectivity state for each
// of the requested instances. Missing instances are simply absent from the
// returned map — callers treat "no row" as UNKNOWN.
func (s *PGInstanceRuntimeStateStore) ListInstanceRuntimeStates(ctx context.Context, instanceIDs []string) (map[string]InstanceRuntimeState, error) {
	result := make(map[string]InstanceRuntimeState, len(instanceIDs))
	if len(instanceIDs) == 0 {
		return result, nil
	}

	idExprs := make([]postgres.Expression, len(instanceIDs))
	for i, id := range instanceIDs {
		idExprs[i] = postgres.String(id)
	}

	stmt := postgres.SELECT(table.InstanceRuntimeState.AllColumns).
		FROM(table.InstanceRuntimeState).
		WHERE(table.InstanceRuntimeState.InstanceID.IN(idExprs...))

	var rows []modelgen.InstanceRuntimeState
	if err := stmt.QueryContext(ctx, s.db, &rows); err != nil {
		return nil, fmt.Errorf("list instance runtime states: %w", err)
	}

	for _, row := range rows {
		mapped := mapInstanceRuntimeState(row)
		result[mapped.InstanceID] = mapped
	}

	return result, nil
}

func mapInstanceRuntimeState(row modelgen.InstanceRuntimeState) InstanceRuntimeState {
	return InstanceRuntimeState{
		InstanceID:          row.InstanceID,
		ConnectionState:     row.ConnectionState,
		ConnectionError:     row.ConnectionError,
		ConnectionCheckedAt: row.ConnectionCheckedAt,
		CreatedAt:           row.CreatedAt,
		UpdatedAt:           row.UpdatedAt,
	}
}
