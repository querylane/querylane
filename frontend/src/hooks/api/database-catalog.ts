import { createClient, type Transport } from "@connectrpc/connect";
import { useTransport } from "@connectrpc/connect-query";
import { useQuery } from "@tanstack/react-query";
import { buildContainsFilter } from "@/lib/aip-filter";
import {
  buildDatabaseName,
  buildSchemaName,
  normalizeEstimatedRowCount,
} from "@/lib/console-resources";
import {
  type ListSchemasResponse,
  type Schema,
  SchemaService,
} from "@/protogen/querylane/console/v1alpha1/schema_pb";
import {
  type Table,
  Table_TableType,
  TableService,
} from "@/protogen/querylane/console/v1alpha1/table_pb";
import {
  type View,
  View_ViewType,
  ViewService,
} from "@/protogen/querylane/console/v1alpha1/view_pb";

// The catalog APIs expose no database-level aggregates. Keep overview work
// bounded because this query also runs during route prefetch.
const CATALOG_PAGE_SIZE = 200;
const CATALOG_OBJECT_LIMIT = 1000;
const CATALOG_SCHEMA_LIMIT = 100;
const CATALOG_SCHEMA_CONCURRENCY = 4;
const DEFAULT_SEARCH_LIMIT = 5;
const FILTERED_SEARCH_LIMIT = 10;
const ZERO_BYTES = 0n;

type ProtoTimestamp = Schema["lastDdlTime"];
type CatalogSyncMetadata = ListSchemasResponse["syncMetadata"];

interface CatalogObject {
  comment: string;
  isMaterialized: boolean;
  isPopulated: boolean;
  isSystem: boolean;
  kind: "table" | "view";
  lastDdlTime: ProtoTimestamp;
  /** Full resource name (used for stable keys). */
  name: string;
  /** Bare object name (used for display + explorer deep links). */
  objectId: string;
  owner: string;
  rowCount: bigint;
  schemaId: string;
  sizeBytes: bigint;
  tableType: Table_TableType;
}

interface CatalogSchema {
  estimatedRows: number;
  isSystemSchema: boolean;
  lastDdlTime: ProtoTimestamp;
  name: string;
  owner: string;
  schemaId: string;
  tableCount: number;
  totalSizeBytes: bigint;
  viewCount: number;
}

interface CatalogTotals {
  estimatedRows: number;
  schemaCount: number;
  tableCount: number;
  totalSizeBytes: bigint;
  viewCount: number;
}

interface CatalogCoverage {
  isPartial: boolean;
  objectLimit: number;
  objectsPartial: boolean;
  schemaLimit: number;
  schemasPartial: boolean;
}

interface DatabaseCatalogResult {
  coverage: CatalogCoverage;
  objects: CatalogObject[];
  schemas: CatalogSchema[];
  syncMetadata: CatalogSyncMetadata;
  totals: CatalogTotals;
}

function tableToObject(table: Table, schemaId: string): CatalogObject {
  return {
    comment: table.comment,
    isMaterialized: false,
    isPopulated: true,
    isSystem: table.isSystemTable,
    kind: "table",
    lastDdlTime: table.lastDdlTime,
    name: table.name,
    objectId: table.displayName,
    owner: table.owner,
    rowCount: table.rowCount,
    schemaId,
    sizeBytes: table.sizeBytes,
    tableType: table.tableType,
  };
}

function viewToObject(view: View, schemaId: string): CatalogObject {
  return {
    comment: view.comment,
    isMaterialized: view.viewType === View_ViewType.MATERIALIZED,
    isPopulated: view.isPopulated,
    isSystem: view.isSystemView,
    kind: "view",
    lastDdlTime: view.lastDdlTime,
    name: view.name,
    objectId: view.displayName,
    owner: view.owner,
    rowCount: view.rowCount,
    schemaId,
    sizeBytes: view.sizeBytes,
    tableType: Table_TableType.UNSPECIFIED,
  };
}

function fetchSchemasPage(transport: Transport, parent: string) {
  const client = createClient(SchemaService, transport);
  return client.listSchemas({
    orderBy: "name asc",
    pageSize: CATALOG_SCHEMA_LIMIT,
    parent,
  });
}

function fetchTablesPage(
  transport: Transport,
  parent: string,
  pageSize: number
) {
  const client = createClient(TableService, transport);
  return client.listTables({
    orderBy: "name asc",
    pageSize,
    parent,
  });
}

function fetchViewsPage(
  transport: Transport,
  parent: string,
  pageSize: number
) {
  const client = createClient(ViewService, transport);
  return client.listViews({
    orderBy: "name asc",
    pageSize,
    parent,
  });
}

function sumSizeBytes(objects: CatalogObject[]): bigint {
  return objects.reduce((sum, object) => sum + object.sizeBytes, ZERO_BYTES);
}

function sumTableRows(objects: CatalogObject[]): number {
  return objects.reduce((sum, object) => {
    if (object.kind !== "table") {
      return sum;
    }
    return sum + normalizeEstimatedRowCount(object.rowCount);
  }, 0);
}

async function fetchSchemaCatalog(
  transport: Transport,
  input: {
    databaseId: string;
    instanceId: string;
    maxObjects: number;
    schema: Schema;
  }
): Promise<{
  aggregate: CatalogSchema;
  isPartial: boolean;
  objects: CatalogObject[];
}> {
  const schemaId = input.schema.displayName;
  const parent = buildSchemaName(input.instanceId, input.databaseId, schemaId);
  const [tablesResponse, viewsResponse] = await Promise.all([
    fetchTablesPage(transport, parent, input.maxObjects),
    fetchViewsPage(transport, parent, input.maxObjects),
  ]);
  const tables = tablesResponse.tables.map((table) =>
    tableToObject(table, schemaId)
  );
  const views = viewsResponse.views.map((view) => viewToObject(view, schemaId));
  const objects = [...tables, ...views]
    .toSorted((left, right) => Number(right.sizeBytes - left.sizeBytes))
    .slice(0, input.maxObjects);

  return {
    aggregate: {
      estimatedRows: sumTableRows(objects),
      isSystemSchema: input.schema.isSystemSchema,
      lastDdlTime: input.schema.lastDdlTime,
      name: input.schema.name,
      owner: input.schema.owner,
      schemaId,
      tableCount: objects.filter((object) => object.kind === "table").length,
      totalSizeBytes: sumSizeBytes(objects),
      viewCount: objects.filter((object) => object.kind === "view").length,
    },
    isPartial: Boolean(
      tablesResponse.nextPageToken ||
        viewsResponse.nextPageToken ||
        tables.length + views.length > input.maxObjects
    ),
    objects,
  };
}

async function fetchDatabaseCatalog(
  transport: Transport,
  input: { databaseId: string; instanceId: string }
): Promise<DatabaseCatalogResult> {
  const schemasResponse = await fetchSchemasPage(
    transport,
    buildDatabaseName(input.instanceId, input.databaseId)
  );
  const availableSchemas = schemasResponse.schemas.slice(
    0,
    CATALOG_SCHEMA_LIMIT
  );
  const perSchema: Awaited<ReturnType<typeof fetchSchemaCatalog>>[] = [];
  let schemasPartial = Boolean(
    schemasResponse.nextPageToken ||
      schemasResponse.schemas.length > CATALOG_SCHEMA_LIMIT
  );
  let objectsPartial = schemasPartial;
  let nextSchemaIndex = 0;
  let remainingObjectCount = CATALOG_OBJECT_LIMIT;

  async function fetchNextSchema(): Promise<void> {
    const schema = availableSchemas[nextSchemaIndex];
    if (!schema || remainingObjectCount === 0) {
      return;
    }
    nextSchemaIndex += 1;
    const reservedObjectCount = Math.min(
      CATALOG_PAGE_SIZE,
      remainingObjectCount
    );
    remainingObjectCount -= reservedObjectCount;
    const result = await fetchSchemaCatalog(transport, {
      databaseId: input.databaseId,
      instanceId: input.instanceId,
      maxObjects: reservedObjectCount,
      schema,
    });
    perSchema.push(result);
    remainingObjectCount += reservedObjectCount - result.objects.length;
    objectsPartial ||= result.isPartial;
    await fetchNextSchema();
  }

  await Promise.all(
    Array.from(
      {
        length: Math.min(CATALOG_SCHEMA_CONCURRENCY, availableSchemas.length),
      },
      fetchNextSchema
    )
  );
  const skippedSchemas = nextSchemaIndex < availableSchemas.length;
  schemasPartial ||= skippedSchemas;
  objectsPartial ||= skippedSchemas;
  const schemas = perSchema.map((entry) => entry.aggregate);
  const objects = perSchema.flatMap((entry) => entry.objects);

  return {
    coverage: {
      isPartial: objectsPartial || schemasPartial,
      objectLimit: CATALOG_OBJECT_LIMIT,
      objectsPartial,
      schemaLimit: CATALOG_SCHEMA_LIMIT,
      schemasPartial,
    },
    objects,
    schemas,
    syncMetadata: schemasResponse.syncMetadata,
    totals: {
      estimatedRows: sumTableRows(objects),
      schemaCount: schemas.length,
      tableCount: objects.filter((object) => object.kind === "table").length,
      totalSizeBytes: sumSizeBytes(objects),
      viewCount: objects.filter((object) => object.kind === "view").length,
    },
  };
}

function useDatabaseCatalogQuery(input: {
  databaseId: string;
  enabled?: boolean;
  instanceId: string;
}) {
  const transport = useTransport();
  return useQuery({
    enabled:
      (input.enabled ?? true) && Boolean(input.instanceId && input.databaseId),
    queryFn: () =>
      fetchDatabaseCatalog(transport, {
        databaseId: input.databaseId,
        instanceId: input.instanceId,
      }),
    queryKey: [
      "console",
      "database-catalog",
      input.instanceId,
      input.databaseId,
    ] as const,
    staleTime: 60_000,
  });
}

async function fetchDatabaseCatalogSearch(
  transport: Transport,
  input: { databaseId: string; instanceId: string; query: string }
): Promise<{ objects: CatalogObject[] }> {
  const databaseName = buildDatabaseName(input.instanceId, input.databaseId);
  const schemasResponse = await fetchSchemasPage(transport, databaseName);
  const filter = buildContainsFilter("name", input.query);
  const limit = filter ? FILTERED_SEARCH_LIMIT : DEFAULT_SEARCH_LIMIT;
  const tableClient = createClient(TableService, transport);
  const viewClient = createClient(ViewService, transport);
  const objects: CatalogObject[] = [];

  async function collectSchema(schemaIndex: number): Promise<void> {
    const schema = schemasResponse.schemas[schemaIndex];
    if (!schema || objects.length >= limit) {
      return;
    }
    const schemaId = schema.displayName;
    const parent = buildSchemaName(
      input.instanceId,
      input.databaseId,
      schemaId
    );
    const request = {
      ...(filter ? { filter } : {}),
      orderBy: "name asc",
      pageSize: limit,
      parent,
    } as const;
    const [tables, views] = await Promise.all([
      tableClient.listTables(request),
      viewClient.listViews(request),
    ]);
    objects.push(
      ...tables.tables.map((table) => tableToObject(table, schemaId)),
      ...views.views.map((view) => viewToObject(view, schemaId))
    );
    await collectSchema(schemaIndex + 1);
  }

  await collectSchema(0);

  return { objects: objects.slice(0, limit) };
}

function useDatabaseCatalogSearchQuery(input: {
  databaseId: string;
  enabled?: boolean;
  instanceId: string;
  query: string;
}) {
  const transport = useTransport();
  const normalizedQuery = input.query.trim().toLowerCase();
  const queryCanRun =
    normalizedQuery.length === 0 || normalizedQuery.length >= 2;
  return useQuery({
    enabled:
      (input.enabled ?? true) &&
      queryCanRun &&
      Boolean(input.instanceId && input.databaseId),
    queryFn: () =>
      fetchDatabaseCatalogSearch(transport, {
        databaseId: input.databaseId,
        instanceId: input.instanceId,
        query: normalizedQuery,
      }),
    queryKey: [
      "console",
      "database-catalog-search",
      input.instanceId,
      input.databaseId,
      normalizedQuery,
    ] as const,
    staleTime: 60_000,
  });
}

export type {
  CatalogCoverage,
  CatalogObject,
  CatalogSchema,
  CatalogSyncMetadata,
  CatalogTotals,
  DatabaseCatalogResult,
};
export { useDatabaseCatalogQuery, useDatabaseCatalogSearchQuery };
