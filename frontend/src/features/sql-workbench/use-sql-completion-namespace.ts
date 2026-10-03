import type { SQLNamespace } from "@codemirror/lang-sql";
import { useTransport } from "@connectrpc/connect-query";
import { useQueries } from "@tanstack/react-query";
import { useDeferredValue } from "react";
import {
  buildCompletionNamespace,
  type CompletionColumn,
  extractReferencedRelations,
} from "@/features/sql-workbench/sql-completion-schema";
import {
  DEFAULT_SCHEMA,
  relationKey,
  type SqlRelation,
  toSqlRelation,
} from "@/features/sql-workbench/sql-relation";
import { relationColumnsQueryOptions } from "@/features/sql-workbench/sql-relation-columns";
import { splitSqlStatements } from "@/features/sql-workbench/sql-statements";
import { useDatabaseCatalogQuery } from "@/hooks/api/database-catalog";

const NO_RELATIONS: SqlRelation[] = [];
/**
 * Before a statement names its tables, column suggestions come from the
 * default schema; this bounds how many of its tables are fetched for that.
 */
const SCHEMA_COLUMN_TABLE_LIMIT = 12;
const SELECT_START_PATTERN = /^\s*select\b/i;
const FROM_PATTERN = /\bfrom\b/i;

/** What the editor's contextual completion needs besides the namespace. */
interface CompletionScope {
  columnsByRelation: ReadonlyMap<string, readonly CompletionColumn[]>;
  defaultSchema: string;
  relations: readonly SqlRelation[];
}

/** True while some statement selects columns without naming a table yet. */
function hasSelectWithoutFrom(text: string): boolean {
  return splitSqlStatements(text).some(
    (statement) =>
      SELECT_START_PATTERN.test(statement.text) &&
      !FROM_PATTERN.test(statement.text)
  );
}

/**
 * Produces the autocompletion namespace for the editor (all relations from
 * the catalog, plus columns for the relations the current text references)
 * and the scope the contextual source ranks columns from.
 */
function useSqlCompletionNamespace({
  databaseId,
  defaultSchema,
  instanceId,
  text,
}: {
  databaseId: string;
  /** The tab's chosen schema; unqualified names resolve there first. */
  defaultSchema?: string | undefined;
  instanceId: string;
  text: string;
}): { namespace: SQLNamespace; scope: CompletionScope } {
  const transport = useTransport();
  const catalog = useDatabaseCatalogQuery({ databaseId, instanceId });
  const relations = catalog.data?.objects.map(toSqlRelation) ?? NO_RELATIONS;
  // ListTableColumns serves tables and materialized views only; plain views
  // are completed by name without columns.
  const kindByKey = new Map(
    relations.flatMap((relation) =>
      relation.kind === "table" || relation.isMaterialized
        ? [[relationKey(relation), relation.kind] as const]
        : []
    )
  );
  // Typing should never block on a catalog lookup; defer the text so column
  // fetches trail the keystrokes.
  const deferredText = useDeferredValue(text);
  const referenced = extractReferencedRelations(
    deferredText,
    relations,
    defaultSchema
  ).filter((relation) => kindByKey.has(relationKey(relation)));
  const schema = defaultSchema ?? DEFAULT_SCHEMA;
  const schemaTables = hasSelectWithoutFrom(deferredText)
    ? relations
        .filter(
          (relation) =>
            relation.schema === schema && kindByKey.has(relationKey(relation))
        )
        .slice(0, SCHEMA_COLUMN_TABLE_LIMIT)
    : [];
  const wanted = [
    ...new Map(
      [...referenced, ...schemaTables].map((relation) => [
        relationKey(relation),
        relation,
      ])
    ).values(),
  ];
  const columnQueries = useQueries({
    queries: wanted.map((relation) =>
      relationColumnsQueryOptions(transport, {
        databaseId,
        instanceId,
        kind: kindByKey.get(relationKey(relation)) ?? "table",
        name: relation.name,
        schema: relation.schema,
      })
    ),
  });
  const columns = new Map<string, readonly CompletionColumn[]>();
  wanted.forEach((relation, index) => {
    const data = columnQueries[index]?.data;
    if (data) {
      columns.set(relationKey(relation), data);
    }
  });
  return {
    namespace: buildCompletionNamespace({ columns, relations }),
    scope: { columnsByRelation: columns, defaultSchema: schema, relations },
  };
}

export type { CompletionScope };
export { useSqlCompletionNamespace };
