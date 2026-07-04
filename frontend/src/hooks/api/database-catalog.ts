import { createClient, type Transport } from "@connectrpc/connect";
import { useTransport } from "@connectrpc/connect-query";
import { useQuery } from "@tanstack/react-query";
import {
  buildDatabaseName,
  buildSchemaName,
  normalizeEstimatedRowCount,
} from "@/lib/console-resources";
import { paginateAllWithLastResponse } from "@/lib/paginate-all";
import {
  type ListSchemasResponse,
  type Schema,
  SchemaService,
} from "@/protogen/querylane/console/v1alpha1/schema_pb";
import {
  type Table,
  TableService,
} from "@/protogen/querylane/console/v1alpha1/table_pb";
import {
  type View,
  View_ViewType,
  ViewService,
} from "@/protogen/querylane/console/v1alpha1/view_pb";

// The catalog APIs expose no database-level aggregates, so the database
// overview paginates every schema's tables/views and sums client-side — the
// same approach the explorer's schema detail uses, widened to a whole database.

const PAGE_SIZE = 200;
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

interface DatabaseCatalogResult {
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
  };
}

function fetchAllSchemas(transport: Transport, parent: string) {
  const client = createClient(SchemaService, transport);
  return paginateAllWithLastResponse(
    (pageToken) =>
      client.listSchemas({
        orderBy: "name asc",
        pageSize: PAGE_SIZE,
        pageToken: pageToken ?? "",
        parent,
      }),
    (response) => response.schemas
  );
}

function fetchAllTables(transport: Transport, parent: string) {
  const client = createClient(TableService, transport);
  return paginateAllWithLastResponse(
    (pageToken) =>
      client.listTables({
        orderBy: "name asc",
        pageSize: PAGE_SIZE,
        pageToken: pageToken ?? "",
        parent,
      }),
    (response) => response.tables
  );
}

function fetchAllViews(transport: Transport, parent: string) {
  const client = createClient(ViewService, transport);
  return paginateAllWithLastResponse(
    (pageToken) =>
      client.listViews({
        orderBy: "name asc",
        pageSize: PAGE_SIZE,
        pageToken: pageToken ?? "",
        parent,
      }),
    (response) => response.views
  );
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
  input: { databaseId: string; instanceId: string; schema: Schema }
): Promise<{ aggregate: CatalogSchema; objects: CatalogObject[] }> {
  const schemaId = input.schema.displayName;
  const parent = buildSchemaName(input.instanceId, input.databaseId, schemaId);
  const [tablesResult, viewsResult] = await Promise.all([
    fetchAllTables(transport, parent),
    fetchAllViews(transport, parent),
  ]);
  const tables = tablesResult.items.map((table) =>
    tableToObject(table, schemaId)
  );
  const views = viewsResult.items.map((view) => viewToObject(view, schemaId));
  const objects = [...tables, ...views];

  return {
    aggregate: {
      estimatedRows: sumTableRows(objects),
      isSystemSchema: input.schema.isSystemSchema,
      lastDdlTime: input.schema.lastDdlTime,
      name: input.schema.name,
      owner: input.schema.owner,
      schemaId,
      tableCount: tables.length,
      totalSizeBytes: sumSizeBytes(objects),
      viewCount: views.length,
    },
    objects,
  };
}

async function fetchDatabaseCatalog(
  transport: Transport,
  input: { databaseId: string; instanceId: string }
): Promise<DatabaseCatalogResult> {
  const schemasResult = await fetchAllSchemas(
    transport,
    buildDatabaseName(input.instanceId, input.databaseId)
  );
  const perSchema = await Promise.all(
    schemasResult.items.map((schema) =>
      fetchSchemaCatalog(transport, {
        databaseId: input.databaseId,
        instanceId: input.instanceId,
        schema,
      })
    )
  );
  const schemas = perSchema.map((entry) => entry.aggregate);
  const objects = perSchema.flatMap((entry) => entry.objects);

  return {
    objects,
    schemas,
    syncMetadata: schemasResult.lastResponse?.syncMetadata,
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

export type {
  CatalogObject,
  CatalogSchema,
  CatalogSyncMetadata,
  CatalogTotals,
  DatabaseCatalogResult,
};
export { useDatabaseCatalogQuery };
