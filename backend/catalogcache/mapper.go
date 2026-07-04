package catalogcache

import (
	"time"

	"github.com/querylane/querylane/backend/engine"
	api "github.com/querylane/querylane/backend/protogen/querylane/console/v1alpha1"
	"github.com/querylane/querylane/backend/storage/gen/querylane/public/model"
	"github.com/querylane/querylane/backend/storage/types"
)

// engineDBToCatalog converts an engine.Database to a catalog model for storage.
func engineDBToCatalog(instanceID string, db engine.Database, now time.Time) model.CatalogDatabase {
	return model.CatalogDatabase{
		InstanceID:       instanceID,
		Name:             db.Name,
		DisplayName:      db.DisplayName,
		CharacterSet:     db.CharacterSet,
		Collation:        db.Collation,
		Owner:            db.Owner,
		IsSystemDatabase: db.IsSystemDatabase,
		SyncedAt:         now,
	}
}

// catalogDBToEngine converts a catalog model back to an engine.Database.
func catalogDBToEngine(row model.CatalogDatabase) engine.Database {
	return engine.Database{
		Name:             row.Name,
		DisplayName:      row.DisplayName,
		CharacterSet:     row.CharacterSet,
		Collation:        row.Collation,
		Owner:            row.Owner,
		IsSystemDatabase: row.IsSystemDatabase,
	}
}

// engineSchemaToCatalog converts an engine.Schema to a catalog model.
func engineSchemaToCatalog(instanceID, databaseName string, s engine.Schema, now time.Time) model.CatalogSchema {
	return model.CatalogSchema{
		InstanceID:     instanceID,
		DatabaseName:   databaseName,
		Name:           s.Name,
		DisplayName:    s.DisplayName,
		Owner:          s.Owner,
		IsSystemSchema: s.IsSystemSchema,
		SyncedAt:       now,
	}
}

// catalogSchemaToEngine converts a catalog model back to an engine.Schema.
func catalogSchemaToEngine(row model.CatalogSchema) engine.Schema {
	return engine.Schema{
		Name:           row.Name,
		DisplayName:    row.DisplayName,
		Owner:          row.Owner,
		IsSystemSchema: row.IsSystemSchema,
	}
}

// engineTableToCatalog converts an engine.Table to a catalog model.
func engineTableToCatalog(instanceID, databaseName, schemaName string, t engine.Table, now time.Time) model.CatalogTable {
	return model.CatalogTable{
		InstanceID:    instanceID,
		DatabaseName:  databaseName,
		SchemaName:    schemaName,
		Name:          t.Name,
		DisplayName:   t.DisplayName,
		TableType:     t.TableType.String(),
		IsSystemTable: t.IsSystemTable,
		Comment:       t.Comment,
		Owner:         t.Owner,
		RowCount:      t.RowCount,
		SizeBytes:     t.SizeBytes,
		SyncedAt:      now,
	}
}

// catalogTableToEngine converts a catalog model back to an engine.Table.
func catalogTableToEngine(row model.CatalogTable) engine.Table {
	return engine.Table{
		Name:          row.Name,
		DisplayName:   row.DisplayName,
		TableType:     parseTableType(row.TableType),
		IsSystemTable: row.IsSystemTable,
		Comment:       row.Comment,
		Owner:         row.Owner,
		RowCount:      row.RowCount,
		SizeBytes:     row.SizeBytes,
	}
}

// engineColumnToCatalog converts an engine.Column to a catalog model.
func engineColumnToCatalog(instanceID, databaseName, schemaName, tableName string, c engine.Column, now time.Time) model.CatalogColumn {
	m := model.CatalogColumn{
		InstanceID:           instanceID,
		DatabaseName:         databaseName,
		SchemaName:           schemaName,
		TableName:            tableName,
		Name:                 c.Name,
		OrdinalPosition:      c.OrdinalPosition,
		DataType:             int32(c.DataType),
		RawType:              c.RawType,
		IsNullable:           c.IsNullable,
		IsPrimaryKey:         c.IsPrimaryKey,
		IsUnique:             c.IsUnique,
		Comment:              c.Comment,
		SyncedAt:             now,
		IsGenerated:          c.IsGenerated,
		GenerationExpression: c.GenerationExpression,
		IsIdentity:           c.IsIdentity,
		IdentityGeneration:   int32(c.IdentityGeneration),
	}

	if c.DefaultValue != "" {
		m.DefaultValue = &c.DefaultValue
	}

	if c.CharacterMaximumLength > 0 {
		v := c.CharacterMaximumLength
		m.CharacterMaximumLength = &v
	}

	return m
}

// catalogColumnToEngine converts a catalog model back to an engine.Column.
func catalogColumnToEngine(row model.CatalogColumn) engine.Column {
	c := engine.Column{
		Name:                 row.Name,
		OrdinalPosition:      row.OrdinalPosition,
		DataType:             api.DataType(row.DataType),
		RawType:              row.RawType,
		IsNullable:           row.IsNullable,
		IsPrimaryKey:         row.IsPrimaryKey,
		IsUnique:             row.IsUnique,
		Comment:              row.Comment,
		IsGenerated:          row.IsGenerated,
		GenerationExpression: row.GenerationExpression,
		IsIdentity:           row.IsIdentity,
		IdentityGeneration:   catalogIntToIdentityEnum(row.IdentityGeneration),
	}

	if row.DefaultValue != nil {
		c.DefaultValue = *row.DefaultValue
	}

	if row.CharacterMaximumLength != nil {
		c.CharacterMaximumLength = *row.CharacterMaximumLength
	}

	return c
}

func catalogIntToIdentityEnum(value int32) api.IdentityGeneration {
	switch value {
	case int32(api.IdentityGeneration_IDENTITY_GENERATION_ALWAYS):
		return api.IdentityGeneration_IDENTITY_GENERATION_ALWAYS
	case int32(api.IdentityGeneration_IDENTITY_GENERATION_BY_DEFAULT):
		return api.IdentityGeneration_IDENTITY_GENERATION_BY_DEFAULT
	default:
		return api.IdentityGeneration_IDENTITY_GENERATION_UNSPECIFIED
	}
}

func engineViewToCatalog(instanceID, databaseName, schemaName string, v engine.View, now time.Time) model.CatalogView {
	return model.CatalogView{
		InstanceID:   instanceID,
		DatabaseName: databaseName,
		SchemaName:   schemaName,
		Name:         v.Name,
		DisplayName:  v.DisplayName,
		ViewType:     int32(v.ViewType),
		Owner:        v.Owner,
		Comment:      v.Comment,
		IsSystemView: v.IsSystemView,
		Definition:   v.Definition,
		SizeBytes:    v.SizeBytes,
		RowCount:     v.RowCount,
		IsPopulated:  v.IsPopulated,
		SyncedAt:     now,
	}
}

func catalogViewToEngine(row model.CatalogView) engine.View {
	return engine.View{
		Name:         row.Name,
		DisplayName:  row.DisplayName,
		ViewType:     api.View_ViewType(row.ViewType),
		Owner:        row.Owner,
		Comment:      row.Comment,
		IsSystemView: row.IsSystemView,
		Definition:   row.Definition,
		SizeBytes:    row.SizeBytes,
		RowCount:     row.RowCount,
		IsPopulated:  row.IsPopulated,
	}
}

func engineConstraintToCatalog(instanceID, databaseName, schemaName, tableName string, c engine.TableConstraint, now time.Time) model.CatalogTableConstraint {
	return model.CatalogTableConstraint{
		InstanceID:            instanceID,
		DatabaseName:          databaseName,
		SchemaName:            schemaName,
		TableName:             tableName,
		Name:                  c.Name,
		Type:                  int32(c.Type),
		ColumnNames:           append(modelEmptyStringArray(), c.ColumnNames...),
		ReferencedSchemaName:  c.ReferencedSchemaName,
		ReferencedTableName:   c.ReferencedTableName,
		ReferencedColumnNames: append(modelEmptyStringArray(), c.ReferencedColumnNames...),
		OnUpdate:              int32(c.OnUpdate),
		OnDelete:              int32(c.OnDelete),
		Definition:            c.Definition,
		SyncedAt:              now,
	}
}

func catalogConstraintToEngine(row model.CatalogTableConstraint) engine.TableConstraint {
	return engine.TableConstraint{
		Name:                  row.Name,
		Type:                  api.ConstraintType(row.Type),
		ColumnNames:           append([]string(nil), row.ColumnNames...),
		ReferencedSchemaName:  row.ReferencedSchemaName,
		ReferencedTableName:   row.ReferencedTableName,
		ReferencedColumnNames: append([]string(nil), row.ReferencedColumnNames...),
		OnUpdate:              api.ReferentialAction(row.OnUpdate),
		OnDelete:              api.ReferentialAction(row.OnDelete),
		Definition:            row.Definition,
	}
}

func engineIndexToCatalog(instanceID, databaseName, schemaName, tableName string, idx engine.TableIndex, now time.Time) model.CatalogTableIndex {
	return model.CatalogTableIndex{
		InstanceID:      instanceID,
		DatabaseName:    databaseName,
		SchemaName:      schemaName,
		TableName:       tableName,
		Name:            idx.Name,
		Method:          idx.Method,
		IsUnique:        idx.IsUnique,
		KeyColumns:      append(modelEmptyStringArray(), idx.KeyColumns...),
		IncludedColumns: append(modelEmptyStringArray(), idx.IncludedColumns...),
		Predicate:       idx.Predicate,
		SizeBytes:       idx.SizeBytes,
		SyncedAt:        now,
	}
}

func catalogIndexToEngine(row model.CatalogTableIndex) engine.TableIndex {
	return engine.TableIndex{
		Name:            row.Name,
		Method:          row.Method,
		IsUnique:        row.IsUnique,
		KeyColumns:      append([]string(nil), row.KeyColumns...),
		IncludedColumns: append([]string(nil), row.IncludedColumns...),
		Predicate:       row.Predicate,
		SizeBytes:       row.SizeBytes,
	}
}

func enginePolicyToCatalog(instanceID, databaseName, schemaName, tableName string, p engine.TablePolicy, now time.Time) model.CatalogTablePolicy {
	return model.CatalogTablePolicy{
		InstanceID:      instanceID,
		DatabaseName:    databaseName,
		SchemaName:      schemaName,
		TableName:       tableName,
		Name:            p.Name,
		Mode:            int32(p.Mode),
		Command:         int32(p.Command),
		Roles:           append(modelEmptyStringArray(), p.Roles...),
		UsingExpression: p.UsingExpression,
		CheckExpression: p.CheckExpression,
		SyncedAt:        now,
	}
}

func catalogPolicyToEngine(row model.CatalogTablePolicy) engine.TablePolicy {
	return engine.TablePolicy{
		Name:            row.Name,
		Mode:            api.PolicyMode(row.Mode),
		Command:         api.PolicyCommand(row.Command),
		Roles:           append([]string(nil), row.Roles...),
		UsingExpression: row.UsingExpression,
		CheckExpression: row.CheckExpression,
	}
}

func engineTriggerToCatalog(instanceID, databaseName, schemaName, tableName string, t engine.TableTrigger, now time.Time) model.CatalogTableTrigger {
	return model.CatalogTableTrigger{
		InstanceID:   instanceID,
		DatabaseName: databaseName,
		SchemaName:   schemaName,
		TableName:    tableName,
		Name:         t.Name,
		Timing:       t.Timing,
		Events:       append(modelEmptyStringArray(), t.Events...),
		FunctionName: t.FunctionName,
		Enabled:      t.Enabled,
		Definition:   t.Definition,
		SyncedAt:     now,
	}
}

func catalogTriggerToEngine(row model.CatalogTableTrigger) engine.TableTrigger {
	return engine.TableTrigger{
		Name:         row.Name,
		Timing:       row.Timing,
		Events:       append([]string(nil), row.Events...),
		FunctionName: row.FunctionName,
		Enabled:      row.Enabled,
		Definition:   row.Definition,
	}
}

func modelEmptyStringArray() types.StringArray {
	return types.StringArray{}
}

func engineServerInfoToCatalog(instanceID string, info engine.ServerInfo, now time.Time) model.CatalogServerInfo {
	return model.CatalogServerInfo{
		InstanceID:     instanceID,
		Version:        info.Version,
		VersionNum:     info.VersionNum,
		StartedAt:      &info.StartedAt,
		IsInRecovery:   info.IsInRecovery,
		MaxConnections: info.MaxConnections,
		SyncedAt:       now,
	}
}

func catalogServerInfoToEngine(row model.CatalogServerInfo) engine.ServerInfo {
	info := engine.ServerInfo{
		Version:        row.Version,
		VersionNum:     row.VersionNum,
		IsInRecovery:   row.IsInRecovery,
		MaxConnections: row.MaxConnections,
	}

	if row.StartedAt != nil {
		info.StartedAt = *row.StartedAt
	}

	return info
}

// parseTableType converts a string table type back to the proto enum.
func parseTableType(s string) api.Table_TableType {
	return engine.ParseTableType(s)
}
