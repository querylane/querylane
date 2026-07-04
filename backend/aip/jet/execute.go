package jet

import (
	"context"
	"fmt"

	"github.com/go-jet/jet/v2/postgres"
	"github.com/go-jet/jet/v2/qrm"

	"github.com/querylane/querylane/backend/aip"
)

// Execute runs a complete paginated list query using go-jet.
func Execute[Model any](
	ctx context.Context,
	schema *Schema[Model],
	params aip.Params,
	baseQuery postgres.SelectStatement,
	db qrm.Queryable,
) ([]Model, string, error) {
	return ExecuteWithCondition(ctx, schema, params, baseQuery, nil, db)
}

// ExecuteWithCondition runs a paginated list query while preserving a fixed
// base WHERE condition (e.g. instance_id = ?). The base condition and the
// generated filter/cursor conditions are combined with AND.
func ExecuteWithCondition[Model any](
	ctx context.Context,
	schema *Schema[Model],
	params aip.Params,
	baseQuery postgres.SelectStatement,
	baseCondition postgres.BoolExpression,
	db qrm.Queryable,
) ([]Model, string, error) {
	plan, err := aip.BuildPlan(schema.core, params)
	if err != nil {
		return nil, "", err
	}

	// Client-attributable errors were already raised by BuildPlan; anything
	// failing in clause compilation is a schema misconfiguration and surfaces
	// as Internal.
	where, orderBy, err := BuildClauses(schema, plan)
	if err != nil {
		return nil, "", err
	}

	stmt := baseQuery.
		ORDER_BY(orderBy...).
		LIMIT(int64(plan.PageSize + 1))

	if cond := combineConditions(baseCondition, where); cond != nil {
		stmt = stmt.WHERE(cond)
	}

	var rows []Model
	if err := stmt.QueryContext(ctx, db, &rows); err != nil {
		return nil, "", fmt.Errorf("query execution failed: %w", err)
	}

	nextToken, err := schema.core.NextPageToken(plan, rows)
	if err != nil {
		return nil, "", err
	}

	if len(rows) > int(plan.PageSize) {
		rows = rows[:plan.PageSize]
	}

	return rows, nextToken, nil
}
