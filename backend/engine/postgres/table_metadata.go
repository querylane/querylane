package postgres

import (
	"context"
	"database/sql"
	"encoding/json"
	"errors"
	"fmt"
	"strings"

	"github.com/querylane/querylane/backend/engine"
	api "github.com/querylane/querylane/backend/protogen/querylane/console/v1alpha1"
	"github.com/querylane/querylane/backend/storage/types"
)

func (d *Postgres) GetTablePartitionMetadata(ctx context.Context, db *sql.DB, schemaName, tableName string) (*engine.TablePartitionMetadata, error) {
	var (
		metadata      engine.TablePartitionMetadata
		childSchemas  types.StringArray
		childTables   types.StringArray
		childBounds   types.StringArray
		childRows     []int64
		childSizes    []int64
		childRowsRaw  []byte
		childSizesRaw []byte
	)

	err := db.QueryRowContext(ctx, getTablePartitionMetadataQuery, schemaName, tableName).Scan(
		&metadata.PartitionKey,
		&metadata.PartitionBound,
		&metadata.ParentSchemaName,
		&metadata.ParentTableName,
		&childSchemas,
		&childTables,
		&childBounds,
		&childRowsRaw,
		&childSizesRaw,
		&metadata.PartitionCount,
	)
	if err != nil {
		if errors.Is(err, sql.ErrNoRows) {
			return nil, fmt.Errorf("%w: %s", engine.ErrTableNotFound, tableName)
		}

		return nil, classifyQueryError("query table partition metadata", err)
	}

	if err := json.Unmarshal(childRowsRaw, &childRows); err != nil {
		return nil, fmt.Errorf("parse table partition row estimates: %w", err)
	}

	if err := json.Unmarshal(childSizesRaw, &childSizes); err != nil {
		return nil, fmt.Errorf("parse table partition sizes: %w", err)
	}

	metadata.ChildPartitions = make([]engine.TablePartition, 0, len(childTables))
	for i, childTable := range childTables {
		child := engine.TablePartition{TableName: childTable}
		if i < len(childSchemas) {
			child.SchemaName = childSchemas[i]
		}

		if i < len(childBounds) {
			child.PartitionBound = childBounds[i]
		}

		if i < len(childRows) {
			child.EstimatedRows = childRows[i]
		}

		if i < len(childSizes) {
			child.TotalSizeBytes = childSizes[i]
		}

		metadata.ChildPartitions = append(metadata.ChildPartitions, child)
	}

	return &metadata, nil
}

// ListTableColumns returns detailed column information for a specific table.
func (d *Postgres) ListTableColumns(ctx context.Context, db *sql.DB, schemaName, tableName string) ([]engine.Column, error) {
	rows, err := db.QueryContext(ctx, listTableColumnsQuery, schemaName, tableName)
	if err != nil {
		return nil, classifyQueryError("query table columns", err)
	}
	defer rows.Close()

	var columns []engine.Column

	for rows.Next() {
		var (
			column             engine.Column
			baseType           string
			isArray            bool
			identityGeneration string
		)

		err := rows.Scan(
			&column.Name,
			&column.OrdinalPosition,
			&column.RawType,
			&column.IsNullable,
			&column.IsPrimaryKey,
			&column.DefaultValue,
			&column.CharacterMaximumLength,
			&column.Comment,
			&column.IsUnique,
			&baseType,
			&isArray,
			&column.IsGenerated,
			&column.GenerationExpression,
			&column.IsIdentity,
			&identityGeneration,
		)
		if err != nil {
			return nil, classifyQueryError("scan table column", err)
		}

		column.DataType = pgTypeToDataType(baseType, isArray)
		column.IdentityGeneration = pgIdentityCharToEnum(identityGeneration)
		columns = append(columns, column)
	}

	if err := rows.Err(); err != nil {
		return nil, classifyQueryError("iterate table columns", err)
	}

	if len(columns) == 0 {
		if _, err := d.GetSchema(ctx, db, schemaName); err != nil {
			return nil, err
		}

		exists, err := tableExists(ctx, db, schemaName, tableName)
		if err != nil {
			return nil, err
		}

		if !exists {
			return nil, fmt.Errorf("%w: %s", engine.ErrTableNotFound, tableName)
		}
	}

	return columns, nil
}

func pgIdentityCharToEnum(value string) api.IdentityGeneration {
	switch value {
	case "a":
		return api.IdentityGeneration_IDENTITY_GENERATION_ALWAYS
	case "d":
		return api.IdentityGeneration_IDENTITY_GENERATION_BY_DEFAULT
	default:
		return api.IdentityGeneration_IDENTITY_GENERATION_UNSPECIFIED
	}
}

// ListTableConstraints returns constraints for a specific table.
func (d *Postgres) ListTableConstraints(ctx context.Context, db *sql.DB, schemaName, tableName string) ([]engine.TableConstraint, error) {
	rows, err := db.QueryContext(ctx, listTableConstraintsQuery, schemaName, tableName)
	if err != nil {
		return nil, classifyQueryError("query table constraints", err)
	}
	defer rows.Close()

	var constraints []engine.TableConstraint

	for rows.Next() {
		var (
			c                     engine.TableConstraint
			conType               string
			refSchema, refTable   string
			onUpdate, onDelete    string
			columnNames           types.StringArray
			referencedColumnNames types.StringArray
		)

		err := rows.Scan(
			&c.Name,
			&conType,
			&columnNames,
			&refSchema,
			&refTable,
			&referencedColumnNames,
			&onUpdate,
			&onDelete,
			&c.Definition,
		)
		if err != nil {
			return nil, classifyQueryError("scan table constraint", err)
		}

		c.ColumnNames = []string(columnNames)
		c.ReferencedColumnNames = []string(referencedColumnNames)
		c.Type = mapConstraintType(conType)

		if refTable != "" {
			c.ReferencedSchemaName = refSchema
			c.ReferencedTableName = refTable
		}

		c.OnUpdate = mapReferentialAction(onUpdate)
		c.OnDelete = mapReferentialAction(onDelete)

		constraints = append(constraints, c)
	}

	if err := rows.Err(); err != nil {
		return nil, classifyQueryError("iterate table constraints", err)
	}

	return constraints, nil
}

// ListTableIndexes returns indexes for a specific table.
func (d *Postgres) ListTableIndexes(ctx context.Context, db *sql.DB, schemaName, tableName string) ([]engine.TableIndex, error) {
	rows, err := db.QueryContext(ctx, listTableIndexesQuery, schemaName, tableName)
	if err != nil {
		return nil, classifyQueryError("query table indexes", err)
	}
	defer rows.Close()

	var indexes []engine.TableIndex

	for rows.Next() {
		var (
			idx             engine.TableIndex
			keyColumns      types.StringArray
			keyParts        types.StringArray
			includedColumns types.StringArray
		)

		err := rows.Scan(
			&idx.Name,
			&idx.Method,
			&idx.IsUnique,
			&keyColumns,
			&includedColumns,
			&idx.Predicate,
			&idx.SizeBytes,
			&keyParts,
			&idx.IsValid,
			&idx.HasExpression,
			&idx.Definition,
			&idx.ScanCount,
			&idx.TuplesRead,
			&idx.TuplesFetched,
			&idx.BlocksHit,
			&idx.BlocksRead,
			&idx.HasUsageStats,
		)
		if err != nil {
			return nil, classifyQueryError("scan table index", err)
		}

		idx.KeyColumns = []string(keyColumns)
		idx.KeyParts = []string(keyParts)
		idx.IncludedColumns = []string(includedColumns)
		indexes = append(indexes, idx)
	}

	if err := rows.Err(); err != nil {
		return nil, classifyQueryError("iterate table indexes", err)
	}

	return indexes, nil
}

// ListTablePolicies returns RLS policies for a specific table.
func (d *Postgres) ListTablePolicies(ctx context.Context, db *sql.DB, schemaName, tableName string) ([]engine.TablePolicy, error) {
	rows, err := db.QueryContext(ctx, listTablePoliciesQuery, schemaName, tableName)
	if err != nil {
		return nil, classifyQueryError("query table policies", err)
	}
	defer rows.Close()

	var policies []engine.TablePolicy

	for rows.Next() {
		var (
			pol     engine.TablePolicy
			mode    string
			command string
			roles   types.StringArray
		)

		err := rows.Scan(
			&pol.Name,
			&mode,
			&command,
			&roles,
			&pol.UsingExpression,
			&pol.CheckExpression,
		)
		if err != nil {
			return nil, classifyQueryError("scan table policy", err)
		}

		pol.Roles = []string(roles)
		pol.Mode = mapPolicyMode(mode)
		pol.Command = mapPolicyCommand(command)
		policies = append(policies, pol)
	}

	if err := rows.Err(); err != nil {
		return nil, classifyQueryError("iterate table policies", err)
	}

	return policies, nil
}

// ListTableTriggers returns triggers for a specific table.
func (d *Postgres) ListTableTriggers(ctx context.Context, db *sql.DB, schemaName, tableName string) ([]engine.TableTrigger, error) {
	rows, err := db.QueryContext(ctx, listTableTriggersQuery, schemaName, tableName)
	if err != nil {
		return nil, classifyQueryError("query table triggers", err)
	}
	defer rows.Close()

	var triggers []engine.TableTrigger

	for rows.Next() {
		var (
			trig   engine.TableTrigger
			events types.StringArray
		)

		err := rows.Scan(
			&trig.Name,
			&trig.Timing,
			&events,
			&trig.FunctionName,
			&trig.Enabled,
			&trig.Definition,
		)
		if err != nil {
			return nil, classifyQueryError("scan table trigger", err)
		}

		trig.Events = []string(events)
		triggers = append(triggers, trig)
	}

	if err := rows.Err(); err != nil {
		return nil, classifyQueryError("iterate table triggers", err)
	}

	return triggers, nil
}

func mapConstraintType(pgType string) api.ConstraintType {
	switch pgType {
	case "p":
		return api.ConstraintType_CONSTRAINT_TYPE_PRIMARY_KEY
	case "u":
		return api.ConstraintType_CONSTRAINT_TYPE_UNIQUE
	case "f":
		return api.ConstraintType_CONSTRAINT_TYPE_FOREIGN_KEY
	case "c":
		return api.ConstraintType_CONSTRAINT_TYPE_CHECK
	case "x":
		return api.ConstraintType_CONSTRAINT_TYPE_EXCLUSION
	default:
		return api.ConstraintType_CONSTRAINT_TYPE_UNSPECIFIED
	}
}

func mapReferentialAction(pgAction string) api.ReferentialAction {
	switch pgAction {
	case "a":
		return api.ReferentialAction_REFERENTIAL_ACTION_NO_ACTION
	case "r":
		return api.ReferentialAction_REFERENTIAL_ACTION_RESTRICT
	case "c":
		return api.ReferentialAction_REFERENTIAL_ACTION_CASCADE
	case "n":
		return api.ReferentialAction_REFERENTIAL_ACTION_SET_NULL
	case "d":
		return api.ReferentialAction_REFERENTIAL_ACTION_SET_DEFAULT
	default:
		return api.ReferentialAction_REFERENTIAL_ACTION_UNSPECIFIED
	}
}

func mapPolicyMode(mode string) api.PolicyMode {
	switch mode {
	case "PERMISSIVE":
		return api.PolicyMode_POLICY_MODE_PERMISSIVE
	case "RESTRICTIVE":
		return api.PolicyMode_POLICY_MODE_RESTRICTIVE
	default:
		return api.PolicyMode_POLICY_MODE_UNSPECIFIED
	}
}

func mapPolicyCommand(cmd string) api.PolicyCommand {
	switch cmd {
	case "*":
		return api.PolicyCommand_POLICY_COMMAND_ALL
	case "r":
		return api.PolicyCommand_POLICY_COMMAND_SELECT
	case "a":
		return api.PolicyCommand_POLICY_COMMAND_INSERT
	case "w":
		return api.PolicyCommand_POLICY_COMMAND_UPDATE
	case "d":
		return api.PolicyCommand_POLICY_COMMAND_DELETE
	default:
		return api.PolicyCommand_POLICY_COMMAND_UNSPECIFIED
	}
}

// pgTypeToDataType maps a PostgreSQL base type name to our abstract type enum.
// Callers pass the catalog's canonical name (pg_type.typname, e.g. "int4",
// "varchar", "timestamptz") or the driver's reported name, plus an explicit
// isArray flag taken from pg_type.typcategory — so array-ness comes from the
// catalog rather than from sniffing the printed type string.
func pgTypeToDataType(typeName string, isArray bool) api.DataType {
	if isArray {
		return api.DataType_DATA_TYPE_ARRAY
	}

	switch strings.ToLower(strings.TrimSpace(typeName)) {
	case "character varying", "varchar", "character", "char", "text", "name", "bpchar":
		return api.DataType_DATA_TYPE_STRING
	case "integer", "bigint", "smallint", "int2", "int4", "int8":
		return api.DataType_DATA_TYPE_INTEGER
	case "numeric", "decimal", "real", "double precision", "float4", "float8":
		return api.DataType_DATA_TYPE_FLOAT
	case "boolean", "bool":
		return api.DataType_DATA_TYPE_BOOLEAN
	case "date":
		return api.DataType_DATA_TYPE_DATE
	case "time", "timetz", "time with time zone", "time without time zone":
		return api.DataType_DATA_TYPE_TIME
	case "timestamp", "timestamptz", "timestamp with time zone", "timestamp without time zone":
		return api.DataType_DATA_TYPE_TIMESTAMP
	case "bytea":
		return api.DataType_DATA_TYPE_BINARY
	case "uuid":
		return api.DataType_DATA_TYPE_UUID
	case "json", "jsonb":
		return api.DataType_DATA_TYPE_JSON
	default:
		return api.DataType_DATA_TYPE_UNKNOWN
	}
}
