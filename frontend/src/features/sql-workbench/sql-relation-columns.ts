import { createClient, type Transport } from "@connectrpc/connect";
import { buildTableName, buildViewName } from "@/lib/console-resources";
import { TableService } from "@/protogen/querylane/console/v1alpha1/table_pb";

interface RelationColumn {
  isPrimaryKey: boolean;
  name: string;
  type: string;
}

interface RelationRef {
  databaseId: string;
  instanceId: string;
  /** ListTableColumns serves tables and materialized views only. */
  kind: "table" | "view";
  name: string;
  schema: string;
}

const COLUMN_STALE_TIME_MINUTES = 5;
const MS_PER_MINUTE = 60_000;
const COLUMN_STALE_TIME_MS = COLUMN_STALE_TIME_MINUTES * MS_PER_MINUTE;

function relationResourceName(relation: RelationRef): string {
  return relation.kind === "view"
    ? buildViewName({
        databaseId: relation.databaseId,
        instanceId: relation.instanceId,
        schemaId: relation.schema,
        viewId: relation.name,
      })
    : buildTableName({
        databaseId: relation.databaseId,
        instanceId: relation.instanceId,
        schemaId: relation.schema,
        tableId: relation.name,
      });
}

async function fetchRelationColumns(
  transport: Transport,
  parent: string
): Promise<RelationColumn[]> {
  const client = createClient(TableService, transport);
  const response = await client.listTableColumns({ parent });
  return response.columns.map((column) => ({
    isPrimaryKey: column.isPrimaryKey,
    name: column.columnName,
    type: column.rawType,
  }));
}

/**
 * Query options for one relation's columns. The catalog rail and the editor's
 * autocompletion share this key, so expanding a table in the rail also warms
 * completion for it and vice versa.
 */
function relationColumnsQueryOptions(
  transport: Transport,
  relation: RelationRef
) {
  const parent = relationResourceName(relation);
  return {
    queryFn: () => fetchRelationColumns(transport, parent),
    queryKey: ["console", "sql-workbench", "columns", parent] as const,
    retry: false,
    staleTime: COLUMN_STALE_TIME_MS,
  };
}

export type { RelationColumn, RelationRef };
export { relationColumnsQueryOptions };
