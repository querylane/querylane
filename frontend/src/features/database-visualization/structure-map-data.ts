import { createClient, type Transport } from "@connectrpc/connect";
import { useTransport } from "@connectrpc/connect-query";
import { useQueries, useQuery } from "@tanstack/react-query";
import type {
  StructureConstraintKind,
  StructureMapSchema,
  StructureMapTable,
  StructureMapView,
} from "@/features/database-visualization/structure-map-model";
import { schemasForDatabaseQueryInput } from "@/hooks/api/schema";
import { tablesForSchemaQueryInput } from "@/hooks/api/table";
import { viewsForSchemaQueryInput } from "@/hooks/api/view";
import { assertNever } from "@/lib/assert-never";
import { parseResourceLeafId } from "@/lib/console-resources";
import { RESOURCE_QUERY_OPTIONS } from "@/lib/query-policy";
import {
  type ListSchemasResponse,
  SchemaService,
} from "@/protogen/querylane/console/v1alpha1/schema_pb";
import {
  ConstraintType,
  type ListTablesResponse,
  PolicyCommand,
  type Table,
  TableService,
} from "@/protogen/querylane/console/v1alpha1/table_pb";
import {
  type ListViewsResponse,
  type View,
  View_ViewType,
  ViewService,
} from "@/protogen/querylane/console/v1alpha1/view_pb";

const MAX_DETAIL_TABLES = 60;
const MAX_DERIVED_CACHE_ENTRIES = 200;
const TABLE_SCHEMA_PATTERN = /\/schemas\/([^/]+)\/tables\//;
const VIEW_SCHEMA_PATTERN = /\/schemas\/([^/]+)\/views\//;

interface TableMetadataResponse {
  columns: Awaited<
    ReturnType<ReturnType<typeof createTableClient>["listTableColumns"]>
  >["columns"];
  constraints: Awaited<
    ReturnType<ReturnType<typeof createTableClient>["listTableConstraints"]>
  >["constraints"];
  indexes: Awaited<
    ReturnType<ReturnType<typeof createTableClient>["listTableIndexes"]>
  >["indexes"];
  policies: Awaited<
    ReturnType<ReturnType<typeof createTableClient>["listTablePolicies"]>
  >["policies"];
  triggers: Awaited<
    ReturnType<ReturnType<typeof createTableClient>["listTableTriggers"]>
  >["triggers"];
}

interface QueryDataResult<T> {
  data: T | undefined;
}

const EMPTY_SCHEMAS: StructureMapSchema[] = [];
const EMPTY_STRUCTURE_TABLES: StructureMapTable[] = [];
const EMPTY_VIEWS: StructureMapView[] = [];
const objectIdentityCache = new WeakMap<object, string>();
const schemaRowsCache = new WeakMap<
  ListSchemasResponse,
  StructureMapSchema[]
>();
const scopedSchemaRowsCache = new WeakMap<
  StructureMapSchema[],
  Map<string, StructureMapSchema[]>
>();
const inspectableTablesCache = new WeakMap<Table[], Table[]>();
const tableRowsCache = new Map<string, Table[]>();
const viewRowsCache = new Map<string, StructureMapView[]>();
const structureTableRowsCache = new Map<string, StructureMapTable[]>();
let nextObjectIdentity = 0;

function objectIdentityKey(value: object | undefined): string {
  if (!value) {
    return "none";
  }
  const cached = objectIdentityCache.get(value);
  if (cached) {
    return cached;
  }
  nextObjectIdentity += 1;
  const nextKey = String(nextObjectIdentity);
  objectIdentityCache.set(value, nextKey);
  return nextKey;
}

function queryDataIdentityKey<T extends object>(
  queries: QueryDataResult<T>[]
): string {
  return queries.map((query) => objectIdentityKey(query.data)).join("|");
}

function rememberDerived<T>(cache: Map<string, T>, key: string, value: T): T {
  if (cache.size >= MAX_DERIVED_CACHE_ENTRIES) {
    const oldestKey = cache.keys().next().value;
    if (oldestKey !== undefined) {
      cache.delete(oldestKey);
    }
  }
  cache.set(key, value);
  return value;
}

interface StructureMapDataInput {
  activeSchemaName?: string | undefined;
  databaseId: string;
  detailScope: "all" | "selected-schema";
  instanceId: string;
}

interface StructureMapDataResult {
  error: unknown;
  hasPartialData: boolean;
  inspectedTableCount: number;
  isLoading: boolean;
  schemas: StructureMapSchema[];
  tableCount: number;
  tables: StructureMapTable[];
  truncatedReason: string | null;
  views: StructureMapView[];
}

function createTableClient(transport: Transport) {
  return createClient(TableService, transport);
}

function fetchSchemas(
  transport: Transport,
  input: ReturnType<typeof schemasForDatabaseQueryInput>
) {
  return createClient(SchemaService, transport).listSchemas(input);
}

function fetchTables(
  transport: Transport,
  input: ReturnType<typeof tablesForSchemaQueryInput>
) {
  return createClient(TableService, transport).listTables(input);
}

function fetchViews(
  transport: Transport,
  input: ReturnType<typeof viewsForSchemaQueryInput>
) {
  return createClient(ViewService, transport).listViews(input);
}

async function fetchTableMetadata(
  transport: Transport,
  parent: string
): Promise<TableMetadataResponse> {
  const client = createTableClient(transport);
  const [columns, constraints, indexes, policies, triggers] = await Promise.all(
    [
      client.listTableColumns({ parent }),
      client.listTableConstraints({ parent }),
      client.listTableIndexes({ parent }),
      client.listTablePolicies({ parent }),
      client.listTableTriggers({ parent }),
    ]
  );
  return {
    columns: columns.columns,
    constraints: constraints.constraints,
    indexes: indexes.indexes,
    policies: policies.policies,
    triggers: triggers.triggers,
  };
}

function schemaRows(
  response: ListSchemasResponse | undefined
): StructureMapSchema[] {
  if (!response) {
    return EMPTY_SCHEMAS;
  }
  const cached = schemaRowsCache.get(response);
  if (cached) {
    return cached;
  }
  const rows = response.schemas.map((schema) => ({
    id: parseResourceLeafId(schema.name),
    name: schema.displayName || parseResourceLeafId(schema.name),
    owner: schema.owner,
  }));
  schemaRowsCache.set(response, rows);
  return rows;
}

function tableSchemaName(table: Table): string {
  const match = TABLE_SCHEMA_PATTERN.exec(table.name);
  return match?.[1] ?? "";
}

function viewSchemaName(view: View): string {
  const match = VIEW_SCHEMA_PATTERN.exec(view.name);
  return match?.[1] ?? "";
}

function tableRows(queries: QueryDataResult<ListTablesResponse>[]): Table[] {
  const key = queryDataIdentityKey(queries);
  const cached = tableRowsCache.get(key);
  if (cached) {
    return cached;
  }
  const rows = queries.flatMap((query) => query.data?.tables ?? []);
  return rememberDerived(tableRowsCache, key, rows);
}

function viewRows(
  queries: QueryDataResult<ListViewsResponse>[]
): StructureMapView[] {
  const key = queryDataIdentityKey(queries);
  const cached = viewRowsCache.get(key);
  if (cached) {
    return cached;
  }
  const rows = queries.flatMap(
    (query) => query.data?.views.map(viewMapRow) ?? EMPTY_VIEWS
  );
  return rememberDerived(viewRowsCache, key, rows);
}

function constraintKind(type: ConstraintType): StructureConstraintKind | null {
  switch (type) {
    case ConstraintType.PRIMARY_KEY:
      return "primary_key";
    case ConstraintType.UNIQUE:
      return "unique";
    case ConstraintType.FOREIGN_KEY:
      return "foreign_key";
    case ConstraintType.CHECK:
      return "check";
    case ConstraintType.EXCLUSION:
      return "exclusion";
    case ConstraintType.UNSPECIFIED:
      return null;
    default:
      return assertNever(type);
  }
}

function policyCommandLabel(command: PolicyCommand): string {
  switch (command) {
    case PolicyCommand.ALL:
      return "ALL";
    case PolicyCommand.SELECT:
      return "SELECT";
    case PolicyCommand.INSERT:
      return "INSERT";
    case PolicyCommand.UPDATE:
      return "UPDATE";
    case PolicyCommand.DELETE:
      return "DELETE";
    case PolicyCommand.UNSPECIFIED:
      return "POLICY";
    default:
      return assertNever(command);
  }
}

function viewTypeLabel(viewType: View_ViewType): StructureMapView["viewType"] {
  switch (viewType) {
    case View_ViewType.MATERIALIZED:
      return "materialized";
    case View_ViewType.STANDARD:
    case View_ViewType.UNSPECIFIED:
      return "standard";
    default:
      return assertNever(viewType);
  }
}

function viewMapRow(view: View): StructureMapView {
  return {
    comment: view.comment,
    owner: view.owner,
    schemaName: viewSchemaName(view),
    viewName: view.displayName || parseResourceLeafId(view.name),
    viewType: viewTypeLabel(view.viewType),
  };
}

function mergeTableMetadata(
  table: Table,
  metadata: TableMetadataResponse | undefined
): StructureMapTable {
  const schemaName = tableSchemaName(table);
  return {
    columns:
      metadata?.columns.map((column) => ({
        columnName: column.columnName,
        isNullable: column.isNullable,
        isPrimaryKey: column.isPrimaryKey,
        isUnique: column.isUnique,
        rawType: column.rawType,
      })) ?? [],
    constraints:
      metadata?.constraints.flatMap((constraint) => {
        const kind = constraintKind(constraint.type);
        if (kind === null) {
          return [];
        }
        return [
          {
            columnNames: constraint.columnNames,
            constraintName: constraint.constraintName,
            referencedColumnNames: constraint.referencedColumnNames,
            referencedTable: constraint.referencedTable,
            type: kind,
          },
        ];
      }) ?? [],
    indexes:
      metadata?.indexes.map((index) => ({
        indexName: index.indexName,
        isUnique: index.isUnique,
        keyColumns: index.keyColumns,
        method: index.method,
      })) ?? [],
    policies:
      metadata?.policies.map((policy) => ({
        command: policyCommandLabel(policy.command),
        policyName: policy.policyName,
        roles: policy.roles,
      })) ?? [],
    schemaName,
    tableName: table.displayName || parseResourceLeafId(table.name),
    triggers:
      metadata?.triggers.map((trigger) => ({
        enabled: trigger.enabled,
        events: trigger.events,
        functionName: trigger.functionName,
        timing: trigger.timing,
        triggerName: trigger.triggerName,
      })) ?? [],
  };
}

function schemasInMapScope({
  activeSchemaName,
  detailScope,
  schemas,
}: {
  activeSchemaName?: string | undefined;
  detailScope: "all" | "selected-schema";
  schemas: StructureMapSchema[];
}): StructureMapSchema[] {
  if (detailScope === "all" || !activeSchemaName) {
    return schemas;
  }
  const cacheKey = `${detailScope}:${activeSchemaName}`;
  const scopeCache = scopedSchemaRowsCache.get(schemas);
  const cached = scopeCache?.get(cacheKey);
  if (cached) {
    return cached;
  }
  const selectedSchemas = schemas.filter(
    (schema) =>
      schema.id === activeSchemaName || schema.name === activeSchemaName
  );
  const scopedSchemas = selectedSchemas.length > 0 ? selectedSchemas : schemas;
  const nextScopeCache = scopeCache ?? new Map<string, StructureMapSchema[]>();
  nextScopeCache.set(cacheKey, scopedSchemas);
  if (!scopeCache) {
    scopedSchemaRowsCache.set(schemas, nextScopeCache);
  }
  return scopedSchemas;
}

function structureMapSchemaInput({
  databaseId,
  instanceId,
}: {
  databaseId: string;
  instanceId: string;
}) {
  return schemasForDatabaseQueryInput({ databaseId, instanceId });
}

function structureMapTableInput({
  databaseId,
  instanceId,
  schemaId,
}: {
  databaseId: string;
  instanceId: string;
  schemaId: string;
}) {
  return tablesForSchemaQueryInput({ databaseId, instanceId, schemaId });
}

function structureMapViewInput({
  databaseId,
  instanceId,
  schemaId,
}: {
  databaseId: string;
  instanceId: string;
  schemaId: string;
}) {
  return viewsForSchemaQueryInput({ databaseId, instanceId, schemaId });
}

function inspectableTables(tables: Table[]): Table[] {
  if (tables.length <= MAX_DETAIL_TABLES) {
    return tables;
  }
  const cached = inspectableTablesCache.get(tables);
  if (cached) {
    return cached;
  }
  const rows = tables.slice(0, MAX_DETAIL_TABLES);
  inspectableTablesCache.set(tables, rows);
  return rows;
}

function firstQueryError(queries: Array<{ error: unknown }>): unknown {
  return queries.find((query) => query.error)?.error;
}

function tableResponsesHaveNextPage(
  queries: QueryDataResult<ListTablesResponse>[]
): boolean {
  return queries.some((query) => Boolean(query.data?.nextPageToken));
}

function viewResponsesHaveNextPage(
  queries: QueryDataResult<ListViewsResponse>[]
): boolean {
  return queries.some((query) => Boolean(query.data?.nextPageToken));
}

function structureTableRows({
  detailQueries,
  detailTables,
  rawTables,
}: {
  detailQueries: QueryDataResult<TableMetadataResponse>[];
  detailTables: Table[];
  rawTables: Table[];
}): StructureMapTable[] {
  if (rawTables.length === 0) {
    return EMPTY_STRUCTURE_TABLES;
  }
  const key = [
    objectIdentityKey(rawTables),
    objectIdentityKey(detailTables),
    queryDataIdentityKey(detailQueries),
  ].join("|");
  const cached = structureTableRowsCache.get(key);
  if (cached) {
    return cached;
  }
  const metadataByTable = new Map<string, TableMetadataResponse>();
  for (const [index, query] of detailQueries.entries()) {
    const table = detailTables[index];
    if (table && query.data) {
      metadataByTable.set(table.name, query.data);
    }
  }
  const inspectedNames = new Set(detailTables.map((table) => table.name));
  const rows = rawTables.map((table) =>
    inspectedNames.has(table.name)
      ? mergeTableMetadata(table, metadataByTable.get(table.name))
      : mergeTableMetadata(table, undefined)
  );
  return rememberDerived(structureTableRowsCache, key, rows);
}

function structureMapTruncatedReason({
  detailScope,
  inspectedTableCount,
  schemaResponse,
  tableResponses,
  totalInspectableTables,
  viewResponses,
}: {
  detailScope: "all" | "selected-schema";
  inspectedTableCount: number;
  schemaResponse: ListSchemasResponse | undefined;
  tableResponses: QueryDataResult<ListTablesResponse>[];
  totalInspectableTables: number;
  viewResponses: QueryDataResult<ListViewsResponse>[];
}): string | null {
  if (detailScope === "all" && schemaResponse?.nextPageToken) {
    return "More schemas are available.";
  }
  if (
    tableResponsesHaveNextPage(tableResponses) ||
    viewResponsesHaveNextPage(viewResponses)
  ) {
    return "More tables or views are available.";
  }
  if (totalInspectableTables > inspectedTableCount) {
    return `Only ${inspectedTableCount} tables have column and constraint details loaded.`;
  }
  return null;
}

function useStructureMapData({
  activeSchemaName,
  databaseId,
  detailScope,
  instanceId,
}: StructureMapDataInput): StructureMapDataResult {
  const transport = useTransport();
  const schemaInput = structureMapSchemaInput({ databaseId, instanceId });
  const schemasQuery = useQuery({
    queryFn: () => fetchSchemas(transport, schemaInput),
    queryKey: ["console", "database-map", "schemas", schemaInput] as const,
    ...RESOURCE_QUERY_OPTIONS.schemaList,
  });
  const schemas = schemasInMapScope({
    activeSchemaName,
    detailScope,
    schemas: schemaRows(schemasQuery.data),
  });
  const tableQueries = useQueries({
    queries: schemas.map((schema) => {
      const input = structureMapTableInput({
        databaseId,
        instanceId,
        schemaId: schema.id,
      });
      return {
        enabled: schemasQuery.isSuccess,
        queryFn: () => fetchTables(transport, input),
        queryKey: ["console", "database-map", "tables", input] as const,
        ...RESOURCE_QUERY_OPTIONS.tableMetadata,
      };
    }),
  });
  const viewQueries = useQueries({
    queries: schemas.map((schema) => {
      const input = structureMapViewInput({
        databaseId,
        instanceId,
        schemaId: schema.id,
      });
      return {
        enabled: schemasQuery.isSuccess,
        queryFn: () => fetchViews(transport, input),
        queryKey: ["console", "database-map", "views", input] as const,
        ...RESOURCE_QUERY_OPTIONS.tableMetadata,
      };
    }),
  });
  const rawTables = tableRows(tableQueries);
  const views = viewRows(viewQueries);
  const detailTables = inspectableTables(rawTables);
  const detailQueries = useQueries({
    queries: detailTables.map((table) => ({
      enabled: tableQueries.every((query) => !query.isLoading),
      queryFn: () => fetchTableMetadata(transport, table.name),
      queryKey: [
        "console",
        "database-map",
        "table-metadata",
        table.name,
      ] as const,
      ...RESOURCE_QUERY_OPTIONS.tableMetadata,
    })),
  });
  const tables = structureTableRows({
    detailQueries,
    detailTables,
    rawTables,
  });
  const error =
    schemasQuery.error ??
    firstQueryError(tableQueries) ??
    firstQueryError(viewQueries) ??
    firstQueryError(detailQueries);
  const isLoading =
    schemasQuery.isLoading ||
    tableQueries.some((query) => query.isLoading) ||
    viewQueries.some((query) => query.isLoading) ||
    detailQueries.some((query) => query.isLoading);
  const reason = structureMapTruncatedReason({
    detailScope,
    inspectedTableCount: detailTables.length,
    schemaResponse: schemasQuery.data,
    tableResponses: tableQueries,
    totalInspectableTables: rawTables.length,
    viewResponses: viewQueries,
  });

  return {
    error,
    hasPartialData: reason !== undefined,
    inspectedTableCount: detailTables.length,
    isLoading,
    schemas,
    tableCount: rawTables.length,
    tables,
    truncatedReason: reason,
    views,
  };
}

export {
  schemasInMapScope,
  structureMapSchemaInput,
  structureMapTableInput,
  structureMapTruncatedReason,
  structureMapViewInput,
  useStructureMapData,
};
