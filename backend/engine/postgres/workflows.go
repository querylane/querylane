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
				Codec:    aip.Int64Codec{},
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

// classifyWorkflowError maps the SQLSTATEs PostgreSQL raises when the df
// schema or its functions are absent — pg_durable not installed in the
// connected database — to engine.ErrDurableNotInstalled, and defers to the
// regular live-SQL classifier for everything else.
func classifyWorkflowError(op string, err error) error {
	if err == nil {
		return nil
	}

	var pgErr *pgconn.PgError
	if errors.As(err, &pgErr) {
		switch pgErr.Code {
		case pgerrcode.UndefinedFunction, pgerrcode.InvalidSchemaName:
			return fmt.Errorf("%w: %w", engine.ErrDurableNotInstalled, err)
		}
	}

	return classifyQueryError(op, err)
}

func scanWorkflow(rows *sql.Rows) (engine.Workflow, error) {
	return scanWorkflowRow(rows)
}

func scanWorkflowRow(s scanner) (engine.Workflow, error) {
	var workflow engine.Workflow

	err := s.Scan(
		&workflow.ID,
		&workflow.Label,
		&workflow.FunctionName,
		&workflow.Status,
		&workflow.ExecutionCount,
		&workflow.Output,
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
		node      engine.WorkflowNode
		leftNode  sql.NullInt64
		rightNode sql.NullInt64
		updatedAt sql.NullTime
	)

	err := rows.Scan(
		&node.NodeID,
		&node.NodeType,
		&node.Query,
		&node.ResultName,
		&leftNode,
		&rightNode,
		&node.Status,
		&node.Result,
		&node.StatusDetails,
		&node.InferredStatus,
		&updatedAt,
	)
	if err != nil {
		return node, err
	}

	if leftNode.Valid {
		node.LeftNode = &leftNode.Int64
	}

	if rightNode.Valid {
		node.RightNode = &rightNode.Int64
	}

	if updatedAt.Valid {
		node.UpdatedAt = &updatedAt.Time
	}

	return node, nil
}
