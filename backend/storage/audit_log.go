package storage

import (
	"context"
	"database/sql"
	"fmt"
	"time"

	"github.com/querylane/querylane/backend/aip"
)

const defaultAuditPageSize = 50

var auditLogSchema = aip.NewSchema(
	"console.querylane.dev/AuditLogEntry",
	aip.Fields[AuditLogEntry]{
		"id": {
			Codec:    aip.Int64Codec{},
			GetValue: func(entry *AuditLogEntry) any { return entry.ID },
		},
	},
	aip.WithDefaultPageSize(defaultAuditPageSize),
	aip.WithMaxPageSize(1000),
	aip.WithDefaultOrder("id", aip.Desc),
)

// AuditMutationStatus is the durable lifecycle state of a UI mutation.
type AuditMutationStatus string

const (
	AuditMutationStarted   AuditMutationStatus = "STARTED"
	AuditMutationSucceeded AuditMutationStatus = "SUCCEEDED"
	AuditMutationFailed    AuditMutationStatus = "FAILED"
)

// AuditMutation describes a mutation before it executes.
type AuditMutation struct {
	Actor        string
	Action       string
	Statement    string
	Target       string
	InstanceName string
	DatabaseName string
}

// AuditLogEntry is one persisted mutation attempt and its outcome.
type AuditLogEntry struct {
	AuditMutation

	ID            int64
	Status        AuditMutationStatus
	ResultSummary string
	StartedAt     time.Time
	FinishedAt    *time.Time
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
	const query = `
		INSERT INTO mutation_audit_log
			(actor, action, statement, target, instance_name, database_name, status)
		VALUES ($1, $2, $3, $4, $5, $6, 'STARTED')
		RETURNING id`

	var id int64
	if err := s.db.QueryRowContext(ctx, query,
		mutation.Actor,
		mutation.Action,
		mutation.Statement,
		mutation.Target,
		mutation.InstanceName,
		mutation.DatabaseName,
	).Scan(&id); err != nil {
		return 0, fmt.Errorf("start mutation audit: %w", err)
	}

	return id, nil
}

// FinishMutation records the final result of a prior mutation attempt.
func (s *PGAuditLogStore) FinishMutation(ctx context.Context, id int64, status AuditMutationStatus, summary string) error {
	if status != AuditMutationSucceeded && status != AuditMutationFailed {
		return fmt.Errorf("%w: audit outcome must be SUCCEEDED or FAILED", ErrInvalidInput)
	}

	result, err := s.db.ExecContext(ctx, `
		UPDATE mutation_audit_log
		SET status = $2, result_summary = $3, finished_at = now()
		WHERE id = $1 AND status = 'STARTED'`, id, status, summary)
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

// ListAuditLogEntries pages entries newest-first using the numeric identity as
// an opaque cursor.
func (s *PGAuditLogStore) ListAuditLogEntries(ctx context.Context, pageSize int32, pageToken string) ([]AuditLogEntry, string, error) {
	plan, err := aip.BuildPlan(auditLogSchema, aip.Params{PageSize: pageSize, PageToken: pageToken})
	if err != nil {
		return nil, "", err
	}

	var cursor int64

	if len(plan.CursorValues) > 0 {
		var ok bool

		cursor, ok = plan.CursorValues[0].(int64)
		if !ok {
			return nil, "", fmt.Errorf("%w: audit cursor has an invalid type", ErrInvalidPageToken)
		}
	}

	rows, err := s.db.QueryContext(ctx, `
		SELECT id, actor, action, statement, target, instance_name, database_name,
		       status, result_summary, started_at, finished_at
		FROM mutation_audit_log
		WHERE ($1::bigint = 0 OR id < $1)
		ORDER BY id DESC
		LIMIT $2`, cursor, plan.PageSize+1)
	if err != nil {
		return nil, "", fmt.Errorf("list mutation audit log: %w", err)
	}
	defer rows.Close()

	entries := make([]AuditLogEntry, 0, plan.PageSize+1)

	for rows.Next() {
		var entry AuditLogEntry
		if err := rows.Scan(
			&entry.ID,
			&entry.Actor,
			&entry.Action,
			&entry.Statement,
			&entry.Target,
			&entry.InstanceName,
			&entry.DatabaseName,
			&entry.Status,
			&entry.ResultSummary,
			&entry.StartedAt,
			&entry.FinishedAt,
		); err != nil {
			return nil, "", fmt.Errorf("scan mutation audit log: %w", err)
		}

		entries = append(entries, entry)
	}

	if err := rows.Err(); err != nil {
		return nil, "", fmt.Errorf("iterate mutation audit log: %w", err)
	}

	nextToken, err := auditLogSchema.NextPageToken(plan, entries)
	if err != nil {
		return nil, "", fmt.Errorf("encode mutation audit page token: %w", err)
	}

	if nextToken == "" {
		return entries, "", nil
	}

	return entries[:plan.PageSize], nextToken, nil
}
