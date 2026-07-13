package catalogcache

import (
	"testing"
	"time"

	"github.com/stretchr/testify/assert"

	"github.com/querylane/querylane/backend/engine"
	api "github.com/querylane/querylane/backend/protogen/querylane/console/v1alpha1"
	"github.com/querylane/querylane/backend/storage/gen/querylane/public/model"
	"github.com/querylane/querylane/backend/storage/types"
)

func TestDatabaseMapperRoundTrip(t *testing.T) {
	t.Parallel()

	original := engine.Database{
		Name:             "testdb",
		DisplayName:      "Test Database",
		CharacterSet:     "UTF8",
		Collation:        "en_US.UTF-8",
		Owner:            "admin",
		IsSystemDatabase: true,
	}

	now := time.Now()
	catalogRow := engineDBToCatalog("inst1", original, now)
	result := catalogDBToEngine(catalogRow)

	assert.Equal(t, original.Name, result.Name)
	assert.Equal(t, original.DisplayName, result.DisplayName)
	assert.Equal(t, original.CharacterSet, result.CharacterSet)
	assert.Equal(t, original.Collation, result.Collation)
	assert.Equal(t, original.Owner, result.Owner)
	assert.Equal(t, original.IsSystemDatabase, result.IsSystemDatabase)
	assert.Equal(t, "inst1", catalogRow.InstanceID)
	assert.Equal(t, now, catalogRow.SyncedAt)
}

func TestSchemaMapperRoundTrip(t *testing.T) {
	t.Parallel()

	original := engine.Schema{
		Name:           "public",
		DisplayName:    "Public Schema",
		Owner:          "postgres",
		IsSystemSchema: false,
	}

	now := time.Now()
	catalogRow := engineSchemaToCatalog("inst1", "mydb", original, now)
	result := catalogSchemaToEngine(catalogRow)

	assert.Equal(t, original.Name, result.Name)
	assert.Equal(t, original.DisplayName, result.DisplayName)
	assert.Equal(t, original.Owner, result.Owner)
	assert.Equal(t, original.IsSystemSchema, result.IsSystemSchema)
	assert.Equal(t, "inst1", catalogRow.InstanceID)
	assert.Equal(t, "mydb", catalogRow.DatabaseName)
}

func TestTableMapperRoundTrip(t *testing.T) {
	t.Parallel()

	original := engine.Table{
		Name:          "users",
		DisplayName:   "Users",
		TableType:     api.Table_TABLE_TYPE_BASE_TABLE,
		IsSystemTable: false,
		Comment:       "User accounts",
		Owner:         "admin",
		RowCount:      1000,
		SizeBytes:     65536,
	}

	now := time.Now()
	catalogRow := engineTableToCatalog("inst1", "mydb", "public", original, now)
	result := catalogTableToEngine(catalogRow)

	assert.Equal(t, original.Name, result.Name)
	assert.Equal(t, original.DisplayName, result.DisplayName)
	assert.Equal(t, original.TableType, result.TableType)
	assert.Equal(t, original.IsSystemTable, result.IsSystemTable)
	assert.Equal(t, original.Comment, result.Comment)
	assert.Equal(t, original.Owner, result.Owner)
	assert.Equal(t, original.RowCount, result.RowCount)
	assert.Equal(t, original.SizeBytes, result.SizeBytes)
}

func TestColumnMapperRoundTrip(t *testing.T) {
	t.Parallel()

	original := engine.Column{
		Name:                   "email",
		OrdinalPosition:        3,
		DataType:               api.DataType_DATA_TYPE_STRING,
		RawType:                "varchar",
		IsNullable:             true,
		IsPrimaryKey:           false,
		IsUnique:               true,
		DefaultValue:           "''",
		CharacterMaximumLength: 255,
		Comment:                "User email address",
		IsGenerated:            true,
		GenerationExpression:   "lower(email)",
		IsIdentity:             true,
		IdentityGeneration:     api.IdentityGeneration_IDENTITY_GENERATION_BY_DEFAULT,
	}

	now := time.Now()
	catalogRow := engineColumnToCatalog("inst1", "mydb", "public", "users", original, now)
	result := catalogColumnToEngine(catalogRow)

	assert.Equal(t, original.Name, result.Name)
	assert.Equal(t, original.OrdinalPosition, result.OrdinalPosition)
	assert.Equal(t, original.DataType, result.DataType)
	assert.Equal(t, original.RawType, result.RawType)
	assert.Equal(t, original.IsNullable, result.IsNullable)
	assert.Equal(t, original.IsPrimaryKey, result.IsPrimaryKey)
	assert.Equal(t, original.IsUnique, result.IsUnique)
	assert.Equal(t, original.DefaultValue, result.DefaultValue)
	assert.Equal(t, original.CharacterMaximumLength, result.CharacterMaximumLength)
	assert.Equal(t, original.Comment, result.Comment)
	assert.Equal(t, original.IsGenerated, result.IsGenerated)
	assert.Equal(t, original.GenerationExpression, result.GenerationExpression)
	assert.Equal(t, original.IsIdentity, result.IsIdentity)
	assert.Equal(t, original.IdentityGeneration, result.IdentityGeneration)
}

func TestColumnMapperNilOptionalFields(t *testing.T) {
	t.Parallel()

	original := engine.Column{
		Name:            "id",
		OrdinalPosition: 1,
		DataType:        api.DataType_DATA_TYPE_INTEGER,
		RawType:         "integer",
		IsPrimaryKey:    true,
		// DefaultValue and CharacterMaximumLength are zero values
	}

	now := time.Now()
	catalogRow := engineColumnToCatalog("inst1", "mydb", "public", "users", original, now)

	assert.Nil(t, catalogRow.DefaultValue, "empty default value should be nil")
	assert.Nil(t, catalogRow.CharacterMaximumLength, "zero max length should be nil")

	result := catalogColumnToEngine(catalogRow)
	assert.Empty(t, result.DefaultValue)
	assert.Equal(t, int32(0), result.CharacterMaximumLength)
}

func TestParseTableType(t *testing.T) {
	t.Parallel()

	tests := []struct {
		name     string
		input    string
		expected api.Table_TableType
	}{
		{"base table", "TABLE_TYPE_BASE_TABLE", api.Table_TABLE_TYPE_BASE_TABLE},
		{"legacy base table", "BASE TABLE", api.Table_TABLE_TYPE_BASE_TABLE},
		{"legacy base table default", "BASE_TABLE", api.Table_TABLE_TYPE_BASE_TABLE},
		{"partitioned table", "TABLE_TYPE_PARTITIONED", api.Table_TABLE_TYPE_PARTITIONED},
		{"external table", "TABLE_TYPE_EXTERNAL", api.Table_TABLE_TYPE_EXTERNAL},
		{"temporary table", "TABLE_TYPE_TEMPORARY", api.Table_TABLE_TYPE_TEMPORARY},
		{"unspecified", "TABLE_TYPE_UNSPECIFIED", api.Table_TABLE_TYPE_UNSPECIFIED},
		{"unknown falls back to unspecified", "UNKNOWN_TYPE", api.Table_TABLE_TYPE_UNSPECIFIED},
		{"empty falls back to unspecified", "", api.Table_TABLE_TYPE_UNSPECIFIED},
	}

	for _, tt := range tests {
		t.Run(tt.name, func(t *testing.T) {
			t.Parallel()

			result := parseTableType(tt.input)
			assert.Equal(t, tt.expected, result)
		})
	}
}

func TestCatalogDBToEngine(t *testing.T) {
	t.Parallel()

	row := model.CatalogDatabase{
		InstanceID:       "inst1",
		Name:             "testdb",
		DisplayName:      "Test",
		CharacterSet:     "UTF8",
		Collation:        "C",
		Owner:            "root",
		IsSystemDatabase: true,
	}

	result := catalogDBToEngine(row)
	assert.Equal(t, "testdb", result.Name)
	assert.Equal(t, "Test", result.DisplayName)
	assert.Equal(t, "UTF8", result.CharacterSet)
	assert.Equal(t, "C", result.Collation)
	assert.Equal(t, "root", result.Owner)
	assert.True(t, result.IsSystemDatabase)
}

func TestViewMapperRoundTrip(t *testing.T) {
	t.Parallel()

	original := engine.View{
		Name:         "customer_orders",
		DisplayName:  "customer_orders",
		ViewType:     api.View_VIEW_TYPE_STANDARD,
		Owner:        "analytics",
		Comment:      "Customer order rollup",
		IsSystemView: false,
		Definition:   "select * from orders",
		SizeBytes:    0,
		RowCount:     0,
		IsPopulated:  true,
	}

	now := time.Now()
	catalogRow := engineViewToCatalog("inst1", "mydb", "sales", original, now)
	result := catalogViewToEngine(catalogRow)

	assert.Equal(t, original.Name, result.Name)
	assert.Equal(t, original.ViewType, result.ViewType)
	assert.Equal(t, original.Definition, result.Definition)
	assert.Equal(t, "sales", catalogRow.SchemaName)
}

func TestConstraintMapperRoundTrip(t *testing.T) {
	t.Parallel()

	tests := []struct {
		name      string
		refSchema string
		refTable  string
	}{
		{name: "simple schema", refSchema: "public", refTable: "customers"},
		{name: "dotted schema", refSchema: "my.schema", refTable: "customers"},
		{name: "dotted table", refSchema: "public", refTable: "customers.archive"},
	}

	for _, tt := range tests {
		t.Run(tt.name, func(t *testing.T) {
			t.Parallel()

			original := engine.TableConstraint{
				Name:                  "orders_customer_id_fkey",
				Type:                  api.ConstraintType_CONSTRAINT_TYPE_FOREIGN_KEY,
				ColumnNames:           []string{"customer_id"},
				ReferencedSchemaName:  tt.refSchema,
				ReferencedTableName:   tt.refTable,
				ReferencedColumnNames: []string{"id"},
				OnUpdate:              api.ReferentialAction_REFERENTIAL_ACTION_CASCADE,
				OnDelete:              api.ReferentialAction_REFERENTIAL_ACTION_RESTRICT,
				Definition:            "FOREIGN KEY (customer_id) REFERENCES customers(id)",
			}

			now := time.Now()
			catalogRow := engineConstraintToCatalog("inst1", "mydb", "sales", "orders", original, now)
			result := catalogConstraintToEngine(catalogRow)

			assert.Equal(t, original.Name, result.Name)
			assert.Equal(t, tt.refSchema, catalogRow.ReferencedSchemaName)
			assert.Equal(t, tt.refTable, catalogRow.ReferencedTableName)
			assert.Equal(t, tt.refSchema, result.ReferencedSchemaName)
			assert.Equal(t, tt.refTable, result.ReferencedTableName)
			assert.Equal(t, types.StringArray{"customer_id"}, catalogRow.ColumnNames)
		})
	}
}

func TestIndexMapperRoundTrip(t *testing.T) {
	t.Parallel()

	original := engine.TableIndex{
		Name:            "idx_orders_customer_id",
		Method:          "btree",
		IsUnique:        false,
		KeyColumns:      []string{"customer_id"},
		KeyParts:        []string{"lower(customer_id::text)"},
		IncludedColumns: []string{"status"},
		Predicate:       "status <> 'deleted'",
		SizeBytes:       1024,
		IsValid:         true,
		HasExpression:   true,
		Definition:      "CREATE INDEX idx_orders_customer_id ON sales.orders USING btree (lower(customer_id::text)) INCLUDE (status)",
		ScanCount:       42,
		TuplesRead:      420,
		TuplesFetched:   40,
		BlocksHit:       99,
		BlocksRead:      1,
		HasUsageStats:   true,
	}

	now := time.Now()
	catalogRow := engineIndexToCatalog("inst1", "mydb", "sales", "orders", original, now)
	result := catalogIndexToEngine(catalogRow)

	assert.Equal(t, original, result)
	assert.Equal(t, types.StringArray{"customer_id"}, catalogRow.KeyColumns)
}

func TestPolicyMapperRoundTrip(t *testing.T) {
	t.Parallel()

	original := engine.TablePolicy{
		Name:            "orders_select_policy",
		Mode:            api.PolicyMode_POLICY_MODE_PERMISSIVE,
		Command:         api.PolicyCommand_POLICY_COMMAND_SELECT,
		Roles:           []string{"reader"},
		UsingExpression: "tenant_id = current_setting('app.tenant_id')::int",
		CheckExpression: "",
	}

	now := time.Now()
	catalogRow := enginePolicyToCatalog("inst1", "mydb", "sales", "orders", original, now)
	result := catalogPolicyToEngine(catalogRow)

	assert.Equal(t, original, result)
	assert.Equal(t, types.StringArray{"reader"}, catalogRow.Roles)
}

func TestTriggerMapperRoundTrip(t *testing.T) {
	t.Parallel()

	original := engine.TableTrigger{
		Name:         "trg_orders_updated_at",
		Timing:       "BEFORE",
		Events:       []string{"UPDATE"},
		FunctionName: "set_updated_at",
		Enabled:      true,
		Definition:   "CREATE TRIGGER ...",
	}

	now := time.Now()
	catalogRow := engineTriggerToCatalog("inst1", "mydb", "sales", "orders", original, now)
	result := catalogTriggerToEngine(catalogRow)

	assert.Equal(t, original, result)
	assert.Equal(t, types.StringArray{"UPDATE"}, catalogRow.Events)
}
