package catalog

import (
	"context"
	"fmt"
	"strings"

	"github.com/go-jet/jet/v2/postgres"

	"github.com/querylane/querylane/backend/storage"
	"github.com/querylane/querylane/backend/storage/gen/querylane/public/table"
)

// Keep cleanup queries and their bound parameters comfortably below
// PostgreSQL's 65,535-parameter protocol limit.
const departedCatalogBatchSize = 1000

type tableChildDeleteConditions struct {
	label       string
	triggers    postgres.BoolExpression
	policies    postgres.BoolExpression
	indexes     postgres.BoolExpression
	constraints postgres.BoolExpression
	columns     postgres.BoolExpression
}

func deleteTableChildCatalogRows(ctx context.Context, tx storage.QueryExecutor, conds tableChildDeleteConditions) error {
	if _, err := table.CatalogTableTrigger.DELETE().
		WHERE(conds.triggers).
		ExecContext(ctx, tx); err != nil {
		return fmt.Errorf("delete %s triggers: %w", conds.label, err)
	}

	if _, err := table.CatalogTablePolicy.DELETE().
		WHERE(conds.policies).
		ExecContext(ctx, tx); err != nil {
		return fmt.Errorf("delete %s policies: %w", conds.label, err)
	}

	if _, err := table.CatalogTableIndex.DELETE().
		WHERE(conds.indexes).
		ExecContext(ctx, tx); err != nil {
		return fmt.Errorf("delete %s indexes: %w", conds.label, err)
	}

	if _, err := table.CatalogTableConstraint.DELETE().
		WHERE(conds.constraints).
		ExecContext(ctx, tx); err != nil {
		return fmt.Errorf("delete %s constraints: %w", conds.label, err)
	}

	if _, err := table.CatalogColumn.DELETE().
		WHERE(conds.columns).
		ExecContext(ctx, tx); err != nil {
		return fmt.Errorf("delete %s columns: %w", conds.label, err)
	}

	return nil
}

func appendTableSubtreeScopeExpressions(out []postgres.Expression, instanceID, databaseName, schemaName, tableName string) []postgres.Expression {
	for _, scope := range tableChildScopes(instanceID, databaseName, schemaName, tableName) {
		out = append(out, postgres.String(scope))
	}

	return append(out, postgres.String(scopeTable(instanceID, databaseName, schemaName, tableName)))
}

// appendSchemaSubtreeScopeExpressions appends the schema row plus its
// tables-list and views-list scopes. Does NOT recurse into per-table scopes —
// the caller is responsible for those (we don't have the table names here).
func appendSchemaSubtreeScopeExpressions(out []postgres.Expression, instanceID, databaseName, schemaName string) []postgres.Expression {
	return append(out,
		postgres.String(scopeSchema(instanceID, databaseName, schemaName)),
		postgres.String(scopeTablesForSchema(instanceID, databaseName, schemaName)),
		postgres.String(scopeViewsForSchema(instanceID, databaseName, schemaName)),
	)
}

// appendDatabaseSubtreeScopeExpressions appends the database row plus its
// schemas-list scope. Does NOT recurse into schemas or tables — the caller
// supplies those via appendSchemaSubtreeScopeExpressions /
// appendTableSubtreeScopeExpressions.
func appendDatabaseSubtreeScopeExpressions(out []postgres.Expression, instanceID, databaseName string) []postgres.Expression {
	return append(out,
		postgres.String(scopeDatabase(instanceID, databaseName)),
		postgres.String(scopeSchemasForDatabase(instanceID, databaseName)),
	)
}

// syncStateScopeBatchSize caps the number of parameters per
// `DELETE … WHERE Scope IN (…)` statement. Postgres' wire-protocol limit is
// 65535; we stay an order of magnitude below so a single instance with many
// thousands of tables still purges cleanly without one giant query.
const syncStateScopeBatchSize = 1000

// deleteSyncStateScopes deletes catalog_sync_state rows for the given scopes,
// batching the IN list so we don't hit Postgres' bound-parameter ceiling on
// instances with many tables. Returns the raw error; callers add their own
// "which cleanup path" context.
func deleteSyncStateScopes(ctx context.Context, tx storage.QueryExecutor, scopes []postgres.Expression) error {
	for start := 0; start < len(scopes); start += syncStateScopeBatchSize {
		end := min(start+syncStateScopeBatchSize, len(scopes))

		if _, err := table.CatalogSyncState.DELETE().
			WHERE(table.CatalogSyncState.Scope.IN(scopes[start:end]...)).
			ExecContext(ctx, tx); err != nil {
			return err
		}
	}

	return nil
}

func escapeLikePattern(value string) string {
	return strings.NewReplacer(
		`\`, `\\`,
		`%`, `\%`,
		`_`, `\_`,
	).Replace(value)
}

// deleteSyncStateSubtrees deletes exact resource scopes and every nested scope
// beneath them. Callers pass bounded batches, so this avoids materializing all
// descendant table scopes for a departed database or schema.
func deleteSyncStateSubtrees(ctx context.Context, tx storage.QueryExecutor, roots []string) error {
	var cond postgres.BoolExpression

	for _, root := range roots {
		rootCond := table.CatalogSyncState.Scope.EQ(postgres.String(root)).
			OR(table.CatalogSyncState.Scope.LIKE(postgres.String(escapeLikePattern(root) + "/%")))
		if cond == nil {
			cond = rootCond
		} else {
			cond = cond.OR(rootCond)
		}
	}

	if cond == nil {
		return nil
	}

	_, err := table.CatalogSyncState.DELETE().WHERE(cond).ExecContext(ctx, tx)

	return err
}
