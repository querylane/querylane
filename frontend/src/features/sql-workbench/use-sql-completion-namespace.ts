import type { SQLNamespace } from "@codemirror/lang-sql";
import { createClient, type Transport } from "@connectrpc/connect";
import { useTransport } from "@connectrpc/connect-query";
import { useQueries } from "@tanstack/react-query";
import { useDeferredValue } from "react";
import {
  buildCompletionNamespace,
  type CompletionColumn,
  type CompletionRelation,
  extractReferencedRelations,
  type ReferencedRelation,
  relationKey,
} from "@/features/sql-workbench/sql-completion-schema";
import { useDatabaseCatalogQuery } from "@/hooks/api/database-catalog";
import { buildTableName, buildViewName } from "@/lib/console-resources";
import { TableService } from "@/protogen/querylane/console/v1alpha1/table_pb";

const COLUMN_STALE_TIME_MINUTES = 5;
const MS_PER_MINUTE = 60_000;
const COLUMN_STALE_TIME_MS = COLUMN_STALE_TIME_MINUTES * MS_PER_MINUTE;
const NO_RELATIONS: CompletionRelation[] = [];

function relationResourceName({
  databaseId,
  instanceId,
  kind,
  relation,
}: {
  databaseId: string;
  instanceId: string;
  kind: "table" | "view";
  relation: ReferencedRelation;
}): string {
  return kind === "view"
    ? buildViewName({
        databaseId,
        instanceId,
        schemaId: relation.schema,
        viewId: relation.name,
      })
    : buildTableName({
        databaseId,
        instanceId,
        schemaId: relation.schema,
        tableId: relation.name,
      });
}

async function fetchColumns(
  transport: Transport,
  parent: string
): Promise<CompletionColumn[]> {
  const client = createClient(TableService, transport);
  const response = await client.listTableColumns({ parent });
  return response.columns.map((column) => ({
    name: column.columnName,
    type: column.rawType,
  }));
}

/**
 * Produces the autocompletion namespace for the editor: all relations from
 * the catalog, plus columns for the relations the current text references.
 */
function useSqlCompletionNamespace({
  databaseId,
  instanceId,
  text,
}: {
  databaseId: string;
  instanceId: string;
  text: string;
}): SQLNamespace {
  const transport = useTransport();
  const catalog = useDatabaseCatalogQuery({ databaseId, instanceId });
  const relations: CompletionRelation[] =
    catalog.data?.objects.map((object) => ({
      kind: object.kind,
      name: object.objectId,
      schema: object.schemaId,
    })) ?? NO_RELATIONS;
  // ListTableColumns serves tables and materialized views only; plain views
  // are completed by name without columns.
  const kindByKey = new Map(
    (catalog.data?.objects ?? [])
      .filter((object) => object.kind === "table" || object.isMaterialized)
      .map((object) => [
        relationKey(object.schemaId, object.objectId),
        object.kind,
      ])
  );
  // Typing should never block on a catalog lookup; defer the text so column
  // fetches trail the keystrokes.
  const deferredText = useDeferredValue(text);
  const referenced = extractReferencedRelations(deferredText, relations).filter(
    (relation) => kindByKey.has(relationKey(relation.schema, relation.name))
  );
  const columnQueries = useQueries({
    queries: referenced.map((relation) => {
      const key = relationKey(relation.schema, relation.name);
      const parent = relationResourceName({
        databaseId,
        instanceId,
        kind: kindByKey.get(key) ?? "table",
        relation,
      });
      return {
        queryFn: () => fetchColumns(transport, parent),
        queryKey: ["console", "sql-workbench", "columns", parent] as const,
        retry: false,
        staleTime: COLUMN_STALE_TIME_MS,
      };
    }),
  });
  const columns = new Map<string, readonly CompletionColumn[]>();
  referenced.forEach((relation, index) => {
    const data = columnQueries[index]?.data;
    if (data) {
      columns.set(relationKey(relation.schema, relation.name), data);
    }
  });
  return buildCompletionNamespace({ columns, relations });
}

export { useSqlCompletionNamespace };
