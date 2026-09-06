import type { SQLNamespace } from "@codemirror/lang-sql";
import { useTransport } from "@connectrpc/connect-query";
import { useQueries } from "@tanstack/react-query";
import { useDeferredValue } from "react";
import {
  buildCompletionNamespace,
  type CompletionColumn,
  type CompletionRelation,
  extractReferencedRelations,
  relationKey,
} from "@/features/sql-workbench/sql-completion-schema";
import { relationColumnsQueryOptions } from "@/features/sql-workbench/sql-relation-columns";
import { useDatabaseCatalogQuery } from "@/hooks/api/database-catalog";

const NO_RELATIONS: CompletionRelation[] = [];

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
      isMaterialized: object.isMaterialized,
      kind: object.kind,
      name: object.objectId,
      schema: object.schemaId,
    })) ?? NO_RELATIONS;
  // ListTableColumns serves tables and materialized views only; plain views
  // are completed by name without columns.
  const kindByKey = new Map(
    (catalog.data?.objects ?? []).flatMap((object) =>
      object.kind === "table" || object.isMaterialized
        ? [
            [
              relationKey(object.schemaId, object.objectId),
              object.kind,
            ] as const,
          ]
        : []
    )
  );
  // Typing should never block on a catalog lookup; defer the text so column
  // fetches trail the keystrokes.
  const deferredText = useDeferredValue(text);
  const referenced = extractReferencedRelations(deferredText, relations).filter(
    (relation) => kindByKey.has(relationKey(relation.schema, relation.name))
  );
  const columnQueries = useQueries({
    queries: referenced.map((relation) =>
      relationColumnsQueryOptions(transport, {
        databaseId,
        instanceId,
        kind:
          kindByKey.get(relationKey(relation.schema, relation.name)) ?? "table",
        name: relation.name,
        schema: relation.schema,
      })
    ),
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
