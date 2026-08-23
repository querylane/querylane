package storage

import (
	"context"
	"database/sql"
	"errors"
	"fmt"
	"time"

	"github.com/go-jet/jet/v2/postgres"
	"github.com/go-jet/jet/v2/qrm"

	"github.com/querylane/querylane/backend/aip"
	aipjet "github.com/querylane/querylane/backend/aip/jet"
	"github.com/querylane/querylane/backend/storage/gen/querylane/public/model"
	"github.com/querylane/querylane/backend/storage/gen/querylane/public/table"
)

const defaultAuditPageSize = 50

var auditLogSchema = aipjet.Bind(
	aip.NewSchema(
		"console.querylane.dev/AuditLogEntry",
		aip.Fields[model.MutationAuditLog]{
			"name": {
				Codec:    aip.Int64Codec{},
				GetValue: func(entry *model.MutationAuditLog) any { return entry.ID },
			},
			"actor": {
				Codec:      aip.StringCodec{},
				GetValue:   func(entry *model.MutationAuditLog) any { return entry.Actor },
				Filterable: true,
			},
			"action": {
				Codec:        aip.StringCodec{},
				GetValue:     func(entry *model.MutationAuditLog) any { return entry.Action },
				Filterable:   true,
				FilterValues: []string{string(AuditMutationRefreshMaterializedView)},
			},
			"target": {
				Codec:      aip.StringCodec{},
				GetValue:   func(entry *model.MutationAuditLog) any { return entry.Target },
				Filterable: true,
			},
			"instance": {
				Codec:      aip.StringCodec{},
				GetValue:   func(entry *model.MutationAuditLog) any { return entry.InstanceName },
				Filterable: true,
			},
			"database": {
				Codec:      aip.StringCodec{},
				GetValue:   func(entry *model.MutationAuditLog) any { return entry.DatabaseName },
				Filterable: true,
			},
			"state": {
				Codec:      aip.StringCodec{},
				GetValue:   func(entry *model.MutationAuditLog) any { return entry.State },
				Filterable: true,
				FilterValues: []string{
					string(AuditMutationRunning),
					string(AuditMutationSucceeded),
					string(AuditMutationFailed),
				},
			},
			"start_time": {
				Codec:      aip.TimestampCodec{},
				GetValue:   func(entry *model.MutationAuditLog) any { return entry.StartTime },
				Filterable: true,
			},
		},
		aip.WithDefaultPageSize(defaultAuditPageSize),
		aip.WithMaxPageSize(1000),
		aip.WithDefaultOrder("start_time", aip.Desc),
		aip.WithTieBreaker("name", aip.Desc),
	),
	aipjet.Columns{
		"name":       table.MutationAuditLog.ID,
		"actor":      table.MutationAuditLog.Actor,
		"action":     table.MutationAuditLog.Action,
		"target":     table.MutationAuditLog.Target,
		"instance":   table.MutationAuditLog.InstanceName,
		"database":   table.MutationAuditLog.DatabaseName,
		"state":      table.MutationAuditLog.State,
		"start_time": table.MutationAuditLog.StartTime,
	},
)

// AuditMutationAction identifies an admitted mutation kind.
type AuditMutationAction string

const (
	// AuditMutationRefreshMaterializedView refreshes one managed materialized view.
	AuditMutationRefreshMaterializedView AuditMutationAction = "REFRESH_MATERIALIZED_VIEW"
)

// AuditMutationState is the durable lifecycle state of a UI mutation.
type AuditMutationState string

const (
	AuditMutationRunning   AuditMutationState = "RUNNING"
	AuditMutationSucceeded AuditMutationState = "SUCCEEDED"
	AuditMutationFailed    AuditMutationState = "FAILED"
)

// AuditMutation describes a mutation before it executes.
type AuditMutation struct {
	Actor        string
	Action       AuditMutationAction
	Command      string
	Target       string
	InstanceName string
	DatabaseName string
}

// AuditLogEntry is one persisted mutation attempt and its outcome.
type AuditLogEntry struct {
	AuditMutation

	ID            int64
	State         AuditMutationState
	ResultSummary string
	StartTime     time.Time
	FinishTime    *time.Time
}

// PGAuditLogStore persists mutation attempts in the meta database.
type PGAuditLogStore struct {
	db *sql.DB
}

// NewAuditLogStore returns an audit log backed by db.
func NewAuditLogStore(db *sql.DB) *PGAuditLogStore {
	return &PGAuditLogStore{db: db}
}

// StartMutation writes the audit entry before the target mutation runs.
func (s *PGAuditLogStore) StartMutation(ctx context.Context, mutation AuditMutation) (int64, error) {
	row := model.MutationAuditLog{
		Actor:        mutation.Actor,
		Action:       string(mutation.Action),
		Command:      mutation.Command,
		Target:       mutation.Target,
		InstanceName: mutation.InstanceName,
		DatabaseName: mutation.DatabaseName,
		State:        string(AuditMutationRunning),
	}
	stmt := table.MutationAuditLog.
		INSERT(
			table.MutationAuditLog.Actor,
			table.MutationAuditLog.Action,
			table.MutationAuditLog.Command,
			table.MutationAuditLog.Target,
			table.MutationAuditLog.InstanceName,
			table.MutationAuditLog.DatabaseName,
			table.MutationAuditLog.State,
		).
		MODEL(row).
		RETURNING(table.MutationAuditLog.AllColumns)

	var created model.MutationAuditLog
	if err := stmt.QueryContext(ctx, s.db, &created); err != nil {
		return 0, fmt.Errorf("start mutation audit: %w", err)
	}

	return created.ID, nil
}

// FinishMutation records the final result of a prior mutation attempt.
func (s *PGAuditLogStore) FinishMutation(ctx context.Context, id int64, state AuditMutationState, summary string) error {
	if state != AuditMutationSucceeded && state != AuditMutationFailed {
		return fmt.Errorf("%w: audit outcome must be SUCCEEDED or FAILED", ErrInvalidInput)
	}

	stmt := table.MutationAuditLog.
		UPDATE(
			table.MutationAuditLog.State,
			table.MutationAuditLog.ResultSummary,
			table.MutationAuditLog.FinishTime,
		).
		SET(
			postgres.String(string(state)),
			postgres.String(summary),
			postgres.NOW(),
		).
		WHERE(
			table.MutationAuditLog.ID.EQ(postgres.Int64(id)).
				AND(table.MutationAuditLog.State.EQ(postgres.String(string(AuditMutationRunning)))),
		)

	result, err := stmt.ExecContext(ctx, s.db)
	if err != nil {
		return fmt.Errorf("finish mutation audit: %w", err)
	}

	rows, err := result.RowsAffected()
	if err != nil {
		return fmt.Errorf("finish mutation audit rows affected: %w", err)
	}

	if rows == 0 {
		return ErrNotFound
	}

	return nil
}

// GetAuditLogEntry returns one mutation audit entry by numeric identity.
func (s *PGAuditLogStore) GetAuditLogEntry(ctx context.Context, id int64) (AuditLogEntry, error) {
	stmt := postgres.SELECT(table.MutationAuditLog.AllColumns).
		FROM(table.MutationAuditLog).
		WHERE(table.MutationAuditLog.ID.EQ(postgres.Int64(id)))

	var row model.MutationAuditLog
	if err := stmt.QueryContext(ctx, s.db, &row); err != nil {
		if errors.Is(err, qrm.ErrNoRows) {
			return AuditLogEntry{}, ErrNotFound
		}

		return AuditLogEntry{}, fmt.Errorf("get mutation audit log entry: %w", err)
	}

	return auditLogEntryFromModel(row), nil
}

// ListAuditLogEntries filters, orders, and keyset-pages immutable entries.
func (s *PGAuditLogStore) ListAuditLogEntries(ctx context.Context, params aip.Params) ([]AuditLogEntry, string, error) {
	query := postgres.SELECT(table.MutationAuditLog.AllColumns).FROM(table.MutationAuditLog)

	rows, nextPageToken, err := aipjet.Execute(ctx, auditLogSchema, params, query, s.db)
	if err != nil {
		return nil, "", fmt.Errorf("list mutation audit log: %w", err)
	}

	entries := make([]AuditLogEntry, len(rows))
	for index, row := range rows {
		entries[index] = auditLogEntryFromModel(row)
	}

	return entries, nextPageToken, nil
}

func auditLogEntryFromModel(row model.MutationAuditLog) AuditLogEntry {
	return AuditLogEntry{
		ID: row.ID,
		AuditMutation: AuditMutation{
			Actor:        row.Actor,
			Action:       AuditMutationAction(row.Action),
			Command:      row.Command,
			Target:       row.Target,
			InstanceName: row.InstanceName,
			DatabaseName: row.DatabaseName,
		},
		State:         AuditMutationState(row.State),
		ResultSummary: row.ResultSummary,
		StartTime:     row.StartTime,
		FinishTime:    row.FinishTime,
	}
}

// PruneAuditLogEntriesOlderThan deletes expired audit entries in bounded,
// independently committed batches and returns the total removed row count.
func PruneAuditLogEntriesOlderThan(ctx context.Context, db QueryExecutor, age time.Duration, batchSize int64) (int64, error) {
	if age <= 0 {
		return 0, fmt.Errorf("%w: audit retention age must be positive", ErrInvalidInput)
	}

	batchSize = max(batchSize, 1)

	var total int64

	for {
		result, err := auditLogPruneStatement(age, batchSize).ExecContext(ctx, db)
		if err != nil {
			return 0, fmt.Errorf("prune mutation audit log: %w", err)
		}

		rows, err := result.RowsAffected()
		if err != nil {
			return 0, fmt.Errorf("prune mutation audit log rows affected: %w", err)
		}

		total += rows
		if rows == 0 {
			return total, nil
		}
	}
}

func auditLogPruneStatement(age time.Duration, batchSize int64) postgres.Statement {
	expiredID := postgres.IntegerColumn("id")
	expired := postgres.CTE("expired", expiredID).AS(
		postgres.SELECT(table.MutationAuditLog.ID).
			FROM(table.MutationAuditLog).
			WHERE(table.MutationAuditLog.StartTime.LT(postgres.NOW().SUB(postgres.INTERVALd(age)))).
			ORDER_BY(table.MutationAuditLog.ID.ASC()).
			LIMIT(batchSize),
	)

	return postgres.WITH(expired)(
		table.MutationAuditLog.DELETE().
			USING(expired).
			WHERE(table.MutationAuditLog.ID.EQ(expiredID.From(expired))),
	)
}
