import type { Completion } from "@codemirror/autocomplete";
import type { SQLNamespace } from "@codemirror/lang-sql";

/**
 * Builds the CodeMirror SQL completion namespace from Querylane's catalog.
 *
 * Tables and views come from the database catalog. Columns are only known for
 * relations the editor text references (see `extractReferencedRelations`), so
 * the workbench does not have to fetch every column in the database up front.
 */

interface CompletionRelation {
  kind: "table" | "view";
  name: string;
  schema: string;
}

interface CompletionColumn {
  name: string;
  type: string;
}

interface ReferencedRelation {
  name: string;
  schema: string;
}

type RelationIndex = ReadonlyMap<string, ReadonlySet<string>>;

const DEFAULT_SCHEMA = "public";
const MAX_REFERENCED_RELATIONS = 12;
const RELATION_REFERENCE_PATTERN =
  /\b(?:from|join|update|into|only)\s+("[^"]+"|[A-Za-z_][\w$]*)(?:\s*\.\s*("[^"]+"|[A-Za-z_][\w$]*))?/gi;
const RESERVED_AFTER_KEYWORD = new Set([
  "lateral",
  "only",
  "select",
  "unnest",
  "values",
]);

function relationKey(schema: string, name: string): string {
  return `${schema}.${name}`;
}

function unquoteIdentifier(identifier: string): string {
  if (identifier.startsWith('"') && identifier.endsWith('"')) {
    return identifier.slice(1, -1).replaceAll('""', '"');
  }
  return identifier.toLowerCase();
}

function indexRelations(
  relations: readonly CompletionRelation[]
): RelationIndex {
  const bySchema = new Map<string, Set<string>>();
  for (const relation of relations) {
    const names = bySchema.get(relation.schema) ?? new Set<string>();
    names.add(relation.name);
    bySchema.set(relation.schema, names);
  }
  return bySchema;
}

function resolveQualified(
  index: RelationIndex,
  schema: string,
  name: string
): ReferencedRelation | null {
  return index.get(schema)?.has(name) ? { name, schema } : null;
}

function resolveUnqualified(
  index: RelationIndex,
  name: string
): ReferencedRelation | null {
  if (index.get(DEFAULT_SCHEMA)?.has(name)) {
    return { name, schema: DEFAULT_SCHEMA };
  }
  for (const [schema, names] of index) {
    if (names.has(name)) {
      return { name, schema };
    }
  }
  return null;
}

function resolveReference(
  index: RelationIndex,
  match: RegExpExecArray
): ReferencedRelation | null {
  const [, first = "", second] = match;
  const firstName = unquoteIdentifier(first);
  if (second) {
    return resolveQualified(index, firstName, unquoteIdentifier(second));
  }
  if (RESERVED_AFTER_KEYWORD.has(firstName)) {
    return null;
  }
  return resolveUnqualified(index, firstName);
}

/**
 * Finds relation names mentioned after FROM/JOIN/UPDATE/INTO and resolves
 * them against the catalog. Unqualified names prefer `public`, then the
 * first schema that has a relation with that name.
 */
function extractReferencedRelations(
  text: string,
  relations: readonly CompletionRelation[]
): ReferencedRelation[] {
  const index = indexRelations(relations);
  const found = new Map<string, ReferencedRelation>();
  for (const match of text.matchAll(RELATION_REFERENCE_PATTERN)) {
    const resolved = resolveReference(index, match);
    if (resolved) {
      found.set(relationKey(resolved.schema, resolved.name), resolved);
    }
    if (found.size >= MAX_REFERENCED_RELATIONS) {
      break;
    }
  }
  return [...found.values()];
}

function columnCompletion(column: CompletionColumn): Completion {
  return {
    boost: 1,
    detail: column.type,
    label: column.name,
    type: "property",
  };
}

function relationCompletion(relation: CompletionRelation): SQLNamespace {
  return {
    children: [],
    self: {
      detail: relation.kind,
      label: relation.name,
      type: relation.kind === "view" ? "interface" : "class",
    },
  };
}

/**
 * Builds the namespace consumed by `@codemirror/lang-sql`. Every schema maps
 * to its relations; relations map to their known columns (or an empty list
 * until the columns have been fetched).
 */
function buildCompletionNamespace({
  columns,
  relations,
}: {
  columns: ReadonlyMap<string, readonly CompletionColumn[]>;
  relations: readonly CompletionRelation[];
}): SQLNamespace {
  const namespace: Record<
    string,
    { children: Record<string, SQLNamespace>; self: Completion }
  > = {};
  for (const relation of relations) {
    let schema = namespace[relation.schema];
    if (!schema) {
      schema = {
        children: {},
        self: { label: relation.schema, type: "namespace" },
      };
      namespace[relation.schema] = schema;
    }
    const known = columns.get(relationKey(relation.schema, relation.name));
    schema.children[relation.name] = known
      ? known.map(columnCompletion)
      : relationCompletion(relation);
  }
  return namespace;
}

export type { CompletionColumn, CompletionRelation, ReferencedRelation };
export {
  buildCompletionNamespace,
  DEFAULT_SCHEMA,
  extractReferencedRelations,
  relationKey,
};
