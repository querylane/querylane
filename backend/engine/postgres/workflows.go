package postgres

import (
	"context"
	"database/sql"
	"errors"
	"fmt"
	"strconv"
	"strings"

	"github.com/jackc/pgerrcode"
	"github.com/jackc/pgx/v5/pgconn"

	"github.com/querylane/querylane/backend/aip"
	"github.com/querylane/querylane/backend/aip/rawsql"
	"github.com/querylane/querylane/backend/engine"
)

// workflowStatusTokens is pg_durable's documented instance lifecycle
// vocabulary, used to bound status filter values.
var workflowStatusTokens = []string{"pending", "running", "completed", "failed", "cancelled"}

var workflowCoreSchema = aip.NewSchema(
	"console.querylane.dev/Workflow",
	aip.Fields[engine.Workflow]{
		"name": {
			Codec:      aip.StringCodec{},
			GetValue:   func(m *engine.Workflow) any { return m.ID },
			Filterable: true,
		},
		"create_time": {
			Codec:    aip.TimestampCodec{},
			GetValue: func(m *engine.Workflow) any { return m.CreateTime },
		},
		"label": {
			Codec:           aip.StringCodec{},
			DisableOrdering: true,
			Filterable:      true,
		},
		"function_name": {
			Codec:           aip.StringCodec{},
			DisableOrdering: true,
		},
		"status": {
			Codec:           aip.StringCodec{},
			DisableOrdering: true,
			Filterable:      true,
			FilterValues:    workflowStatusTokens,
		},
	},
	aip.WithDefaultOrder("create_time", aip.Desc),
	aip.WithTieBreaker("name", aip.Desc),
)

var workflowSchema = rawsql.Bind(
	workflowCoreSchema,
	rawsql.Exprs{
		"name":        "i.id",
		"create_time": "COALESCE(i.created_at, TIMESTAMPTZ 'epoch')",
		"label":       "COALESCE(i.label, '')",
		"status":      "COALESCE(i.status, '')",
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
// connected database, newest first by default.
func (d *Postgres) ListWorkflows(ctx context.Context, db *sql.DB, params aip.Params) ([]engine.Workflow, string, error) {
	plan, err := aip.BuildPlan(workflowCoreSchema, params)
	if err != nil {
		return nil, "", err
	}

	if err := ensurePgDurableInstalled(ctx, db); err != nil {
		return nil, "", err
	}

	clauses, err := rawsql.BuildClauses(workflowSchema, plan, 1)
	if err != nil {
		return nil, "", err
	}

	rows, err := db.QueryContext(ctx, buildWorkflowListQuery(clauses), clauses.Args...)
	if err != nil {
		return nil, "", fmt.Errorf("query execution failed: %w", classifyWorkflowError("list workflows", err))
	}
	defer rows.Close()

	var workflows []engine.Workflow

	for rows.Next() {
		workflow, scanErr := scanWorkflow(rows)
		if scanErr != nil {
			return nil, "", fmt.Errorf("failed to scan query row: %w", classifyWorkflowError("list workflows", scanErr))
		}

		workflows = append(workflows, workflow)
	}

	if err := rows.Err(); err != nil {
		return nil, "", fmt.Errorf("error iterating query rows: %w", classifyWorkflowError("list workflows", err))
	}

	nextToken, err := workflowCoreSchema.NextPageToken(plan, workflows)
	if err != nil {
		return nil, "", err
	}

	if len(workflows) > int(plan.PageSize) {
		workflows = workflows[:plan.PageSize]
	}

	return workflows, nextToken, nil
}

// buildWorkflowListQuery places all predicates and the page-size bound inside
// a materialized metadata CTE. pg_durable 0.2.3's df.list_instances performs
// one sequential runtime lookup for every row in its input window; hydrating
// after this CTE limits df.instance_info calls to page_size+1 instead.
func buildWorkflowListQuery(clauses *rawsql.Clauses) string {
	var query strings.Builder
	query.WriteString(workflowListQuery)

	if clauses.Where != "" {
		query.WriteString(" WHERE ")
		query.WriteString(clauses.Where)
	}

	query.WriteString(" ORDER BY ")
	query.WriteString(clauses.OrderBy)
	query.WriteString(" LIMIT ")
	query.WriteString(strconv.FormatInt(int64(clauses.Limit), 10))
	query.WriteString(`
)
SELECT
	c.id,
	c.label,
	COALESCE(info.function_name, ''),
	c.status,
	COALESCE(info.current_execution_id, 0),
	c.created_at
FROM candidates AS c
LEFT JOIN LATERAL df.instance_info(c.id) AS info ON TRUE
ORDER BY `)
	query.WriteString(strings.ReplaceAll(clauses.OrderBy, "i.", "c."))

	return query.String()
}

// GetWorkflow retrieves one pg_durable workflow instance by id.
func (d *Postgres) GetWorkflow(ctx context.Context, db *sql.DB, workflowID string) (*engine.Workflow, error) {
	if err := ensurePgDurableInstalled(ctx, db); err != nil {
		return nil, err
	}

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
	if err := ensurePgDurableInstalled(ctx, db); err != nil {
		return nil, "", err
	}

	return rawsql.Execute(ctx, workflowNodeSchema, params, withWorkflowErrorClassifier(rawsql.Query{
		BaseQuery: workflowNodeListQuery,
		Args:      []any{workflowID},
	}, "list workflow nodes"), scanWorkflowNode, db)
}

// ensurePgDurableInstalled distinguishes an absent extension from an installed
// but incompatible or damaged one. SQLSTATE 42883/42P01 alone cannot make that
// distinction: an older/newer pg_durable can be installed while a particular
// function or metadata table is missing.
func ensurePgDurableInstalled(ctx context.Context, db *sql.DB) error {
	var installed bool

	err := db.QueryRowContext(ctx, `SELECT EXISTS (
		SELECT 1 FROM pg_catalog.pg_extension WHERE extname = 'pg_durable'
	)`).Scan(&installed)
	if err != nil {
		return fmt.Errorf("failed to check pg_durable installation: %w", classifyQueryError("check pg_durable installation", err))
	}

	if !installed {
		return engine.ErrDurableNotInstalled
	}

	return nil
}

// withWorkflowErrorClassifier installs the WorkflowService-specific privilege
// mapper after ensurePgDurableInstalled has confirmed extension presence.
func withWorkflowErrorClassifier(query rawsql.Query, op string) rawsql.Query {
	query.ErrorMapper = func(err error) error {
		return classifyWorkflowError(op, err)
	}

	return query
}

// classifyWorkflowError maps df privilege failures to an actionable sentinel
// and defers to the regular live-SQL classifier for everything else. Extension
// absence is established authoritatively by ensurePgDurableInstalled; undefined
// objects here therefore mean the installed version is incompatible or broken.
func classifyWorkflowError(op string, err error) error {
	if err == nil {
		return nil
	}

	var pgErr *pgconn.PgError
	if errors.As(err, &pgErr) {
		if pgErr.Code == pgerrcode.InsufficientPrivilege {
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
		&workflow.CreateTime,
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
		&workflow.CreateTime,
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
