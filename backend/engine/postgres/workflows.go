package postgres

import (
	"context"
	"database/sql"
	"errors"
	"fmt"

	"github.com/jackc/pgerrcode"
	"github.com/jackc/pgx/v5/pgconn"

	"github.com/querylane/querylane/backend/aip"
	"github.com/querylane/querylane/backend/aip/rawsql"
	"github.com/querylane/querylane/backend/engine"
)

// workflowListWindow is the listing window requested from df.list_instances.
// It matches pg_durable's default pg_durable.list_instances_max_limit, so one
// window holds everything the extension is willing to report per call.
const workflowListWindow = 1000

// workflowStatusTokens is pg_durable's documented instance lifecycle
// vocabulary, used to bound status filter values.
var workflowStatusTokens = []string{"pending", "running", "completed", "failed", "cancelled"}

var workflowSchema = rawsql.Bind(
	aip.NewSchema(
		"console.querylane.dev/Workflow",
		aip.Fields[engine.Workflow]{
			"name": {
				Codec:      aip.StringCodec{},
				GetValue:   func(m *engine.Workflow) any { return m.ID },
				Filterable: true,
			},
			// Only name is orderable: it is the sole unique column, and keyset
			// cursors over non-unique columns without a tiebreaker can skip or
			// repeat rows across pages.
			"label": {
				Codec:           aip.StringCodec{},
				DisableOrdering: true,
				Filterable:      true,
			},
			"function_name": {
				Codec:           aip.StringCodec{},
				DisableOrdering: true,
				Filterable:      true,
			},
			"status": {
				Codec:           aip.StringCodec{},
				DisableOrdering: true,
				Filterable:      true,
				FilterValues:    workflowStatusTokens,
			},
		},
		aip.WithNameOrdering(),
	),
	rawsql.Exprs{
		"name":          "li.instance_id",
		"label":         "COALESCE(li.label, '')",
		"function_name": "COALESCE(li.function_name, '')",
		"status":        "COALESCE(li.status, '')",
	},
)

var workflowNodeSchema = rawsql.Bind(
	aip.NewSchema(
		"console.querylane.dev/WorkflowNode",
		aip.Fields[engine.WorkflowNode]{
			"node_id": {
				Codec:    aip.StringCodec{},
				GetValue: func(m *engine.WorkflowNode) any { return m.NodeID },
			},
			"node_type": {
				Codec:           aip.StringCodec{},
				DisableOrdering: true,
				Filterable:      true,
			},
			"status": {
				Codec:           aip.StringCodec{},
				DisableOrdering: true,
				Filterable:      true,
			},
		},
		aip.WithDefaultOrder("node_id", aip.Asc),
	),
	rawsql.Exprs{
		"node_id":   "n.node_id",
		"node_type": "COALESCE(n.node_type, '')",
		"status":    "COALESCE(n.status, '')",
	},
)

// ListWorkflows returns pg_durable workflow instances visible in the
// connected database, bounded by the extension's listing window.
func (d *Postgres) ListWorkflows(ctx context.Context, db *sql.DB, params aip.Params) ([]engine.Workflow, string, error) {
	return rawsql.Execute(ctx, workflowSchema, params, withWorkflowErrorClassifier(rawsql.Query{
		BaseQuery: workflowListQuery,
		Args:      []any{workflowListWindow},
	}, "list workflows"), scanWorkflow, db)
}

// GetWorkflow retrieves one pg_durable workflow instance by id.
func (d *Postgres) GetWorkflow(ctx context.Context, db *sql.DB, workflowID string) (*engine.Workflow, error) {
	workflow, err := scanWorkflowInfoRow(db.QueryRowContext(ctx, getWorkflowQuery, workflowID))
	if err != nil {
		if errors.Is(err, sql.ErrNoRows) {
			return nil, fmt.Errorf("%w: %s", engine.ErrWorkflowNotFound, workflowID)
		}

		return nil, fmt.Errorf("failed to query workflow: %w", classifyWorkflowError("get workflow", err))
	}

	return &workflow, nil
}

// ListWorkflowNodes returns the graph nodes of one pg_durable workflow
// instance, ordered by node id.
func (d *Postgres) ListWorkflowNodes(ctx context.Context, db *sql.DB, workflowID string, params aip.Params) ([]engine.WorkflowNode, string, error) {
	return rawsql.Execute(ctx, workflowNodeSchema, params, withWorkflowErrorClassifier(rawsql.Query{
		BaseQuery: workflowNodeListQuery,
		Args:      []any{workflowID},
	}, "list workflow nodes"), scanWorkflowNode, db)
}

// withWorkflowErrorClassifier installs classifyWorkflowError as the query's
// error mapper so a missing pg_durable installation surfaces as
// engine.ErrDurableNotInstalled instead of a generic invalid-query error.
func withWorkflowErrorClassifier(query rawsql.Query, op string) rawsql.Query {
	query.ErrorMapper = func(err error) error {
		return classifyWorkflowError(op, err)
	}

	return query
}

// classifyWorkflowError maps the SQLSTATEs PostgreSQL raises against the df
// schema to actionable sentinels, and defers to the regular live-SQL
// classifier for everything else. Every WorkflowService query targets df.*,
// so these codes have an unambiguous meaning here:
//   - undefined function / schema  → pg_durable is not installed
//   - insufficient privilege       → the role was never granted df.grant_usage
func classifyWorkflowError(op string, err error) error {
	if err == nil {
		return nil
	}

	var pgErr *pgconn.PgError
	if errors.As(err, &pgErr) {
		switch pgErr.Code {
		case pgerrcode.UndefinedFunction, pgerrcode.InvalidSchemaName:
			return fmt.Errorf("%w: %w", engine.ErrDurableNotInstalled, err)
		case pgerrcode.InsufficientPrivilege:
			return fmt.Errorf("%w: %w", engine.ErrDurableAccessDenied, err)
		}
	}

	return classifyQueryError(op, err)
}

func scanWorkflow(rows *sql.Rows) (engine.Workflow, error) {
	return scanWorkflowRow(rows)
}

func scanWorkflowRow(s scanner) (engine.Workflow, error) {
	var workflow engine.Workflow

	// The list surface intentionally does not select output: it is never shown
	// in the list table and a fan-out result can be a large JSON blob per row
	// (see df.instance_info in GetWorkflow for the detail view's output).
	err := s.Scan(
		&workflow.ID,
		&workflow.Label,
		&workflow.FunctionName,
		&workflow.Status,
		&workflow.ExecutionCount,
	)

	return workflow, err
}

func scanWorkflowInfoRow(s scanner) (engine.Workflow, error) {
	var workflow engine.Workflow

	err := s.Scan(
		&workflow.ID,
		&workflow.Label,
		&workflow.FunctionName,
		&workflow.FunctionVersion,
		&workflow.Status,
		&workflow.Output,
		&workflow.CurrentExecutionID,
	)

	return workflow, err
}

func scanWorkflowNode(rows *sql.Rows) (engine.WorkflowNode, error) {
	var (
		node        engine.WorkflowNode
		executionID sql.NullInt64
		leftNode    sql.NullString
		rightNode   sql.NullString
		updatedAt   sql.NullTime
	)

	// execution_id is non-null for every instance observed in pg_durable 0.2.3
	// (even pending instances carry execution 1), but scanning it through
	// NullInt64 keeps a future/edge NULL from failing the whole node listing.
	err := rows.Scan(
		&executionID,
		&node.NodeID,
		&node.NodeType,
		&node.Query,
		&node.ResultName,
		&leftNode,
		&rightNode,
		&node.Status,
		&node.Result,
		&updatedAt,
	)
	if err != nil {
		return node, err
	}

	node.ExecutionID = executionID.Int64

	if leftNode.Valid {
		node.LeftNode = &leftNode.String
	}

	if rightNode.Valid {
		node.RightNode = &rightNode.String
	}

	if updatedAt.Valid {
		node.UpdatedAt = &updatedAt.Time
	}

	return node, nil
}
