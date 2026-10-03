import type { Transport } from "@connectrpc/connect";
import { createQueryOptions } from "@connectrpc/connect-query-core";
import { buildTableName, buildViewName } from "@/lib/console-resources";
import { RESOURCE_QUERY_OPTIONS } from "@/lib/query-policy";
import type { ListTableColumnsResponse } from "@/protogen/querylane/console/v1alpha1/table_pb";
import { listTableColumns } from "@/protogen/querylane/console/v1alpha1/table-TableService_connectquery";

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

function toRelationColumns(
  response: ListTableColumnsResponse
): RelationColumn[] {
  return response.columns.map((column) => ({
    isPrimaryKey: column.isPrimaryKey,
    name: column.columnName,
    type: column.rawType,
  }));
}

/**
 * Query options for one relation's columns. They use the same connect-query
 * key as the Data Explorer's column list, so expanding a table in the rail,
 * completing its columns and opening it in the explorer share one fetch.
 */
function relationColumnsQueryOptions(
  transport: Transport,
  relation: RelationRef
) {
  return {
    ...createQueryOptions(
      listTableColumns,
      { parent: relationResourceName(relation) },
      { transport }
    ),
    ...RESOURCE_QUERY_OPTIONS.tableMetadata,
    retry: false,
    select: toRelationColumns,
  };
}

export type { RelationColumn, RelationRef };
export { relationColumnsQueryOptions };
