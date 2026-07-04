package storage

import (
	"context"
	"database/sql"
	"fmt"
	"time"

	"github.com/go-jet/jet/v2/postgres"

	"github.com/querylane/querylane/backend/storage/gen/querylane/public/model"
	"github.com/querylane/querylane/backend/storage/gen/querylane/public/table"
)

// PGInstanceConnectionRecorder is the single write path for an instance's
// connection_* fields in instance_runtime_state. Use the Tx variants when
// folding the write into a caller-supplied transaction (the runner's
// per-cycle commit); use RecordActive for one-shot observations from
// request-time code such as CreateInstance.
type PGInstanceConnectionRecorder struct {
	db *sql.DB
}

// NewInstanceConnectionRecorder returns a recorder backed by db.
func NewInstanceConnectionRecorder(db *sql.DB) *PGInstanceConnectionRecorder {
	return &PGInstanceConnectionRecorder{db: db}
}

// RecordActive marks an instance reachable in its own transaction; prefer
// RecordActiveTx when the runner is already holding one.
func (r *PGInstanceConnectionRecorder) RecordActive(ctx context.Context, instanceID string, checkedAt time.Time) error {
	return r.RecordActiveTx(ctx, r.db, instanceID, checkedAt)
}

// RecordActiveTx records a successful connectivity probe inside the
// caller's transaction so lease bookkeeping and state stay atomic.
func (r *PGInstanceConnectionRecorder) RecordActiveTx(ctx context.Context, exec QueryExecutor, instanceID string, checkedAt time.Time) error {
	return updateConnectionStateTx(ctx, exec, instanceID, model.ConnectionState_ConnectionStateActive, "", checkedAt)
}

// RecordErrorTx records a failed connectivity probe inside the caller's
// transaction so lease bookkeeping and state stay atomic.
func (r *PGInstanceConnectionRecorder) RecordErrorTx(ctx context.Context, exec QueryExecutor, instanceID string, checkedAt time.Time, err error) error {
	var connErr string
	if err != nil {
		connErr = err.Error()
	}

	return updateConnectionStateTx(ctx, exec, instanceID, model.ConnectionState_ConnectionStateError, connErr, checkedAt)
}

func updateConnectionStateTx(ctx context.Context, exec QueryExecutor, instanceID string, state model.ConnectionState, connectionErr string, checkedAt time.Time) error {
	var connectionError *string
	if connectionErr != "" {
		connectionError = &connectionErr
	}

	row := model.InstanceRuntimeState{
		InstanceID:          instanceID,
		ConnectionState:     state,
		ConnectionError:     connectionError,
		ConnectionCheckedAt: &checkedAt,
	}

	stmt := table.InstanceRuntimeState.
		INSERT(
			table.InstanceRuntimeState.InstanceID,
			table.InstanceRuntimeState.ConnectionState,
			table.InstanceRuntimeState.ConnectionError,
			table.InstanceRuntimeState.ConnectionCheckedAt,
		).
		MODEL(row).
		ON_CONFLICT(table.InstanceRuntimeState.InstanceID).
		DO_UPDATE(postgres.SET(
			table.InstanceRuntimeState.ConnectionState.SET(table.InstanceRuntimeState.EXCLUDED.ConnectionState),
			table.InstanceRuntimeState.ConnectionError.SET(table.InstanceRuntimeState.EXCLUDED.ConnectionError),
			table.InstanceRuntimeState.ConnectionCheckedAt.SET(table.InstanceRuntimeState.EXCLUDED.ConnectionCheckedAt),
		))

	if _, err := stmt.ExecContext(ctx, exec); err != nil {
		return fmt.Errorf("update instance connection state: %w", err)
	}

	return nil
}
