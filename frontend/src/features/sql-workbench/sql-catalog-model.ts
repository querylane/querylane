import type {
  CatalogObject,
  CatalogSchema,
} from "@/hooks/api/database-catalog";

interface CatalogRelation {
  isMaterialized: boolean;
  kind: "table" | "view";
  name: string;
  schema: string;
}

interface CatalogSchemaNode {
  id: string;
  isSystem: boolean;
  relations: CatalogRelation[];
}

const DEFAULT_SCHEMA = "public";
const SAMPLE_ROW_LIMIT = 100;
const PLAIN_IDENTIFIER = /^[a-z_][a-z0-9_$]*$/;
// PostgreSQL keywords that cannot be used as a bare table or column name.
// Quoting them keeps an inserted `"user"` or `"order"` runnable as typed.
const RESERVED_WORDS = new Set([
  "all",
  "analyse",
  "analyze",
  "and",
  "any",
  "array",
  "as",
  "asc",
  "asymmetric",
  "authorization",
  "binary",
  "both",
  "case",
  "cast",
  "check",
  "collate",
  "collation",
  "column",
  "concurrently",
  "constraint",
  "create",
  "cross",
  "current_catalog",
  "current_date",
  "current_role",
  "current_schema",
  "current_time",
  "current_timestamp",
  "current_user",
  "default",
  "deferrable",
  "desc",
  "distinct",
  "do",
  "else",
  "end",
  "except",
  "false",
  "fetch",
  "for",
  "foreign",
  "freeze",
  "from",
  "full",
  "grant",
  "group",
  "having",
  "ilike",
  "in",
  "initially",
  "inner",
  "intersect",
  "into",
  "is",
  "isnull",
  "join",
  "lateral",
  "leading",
  "left",
  "like",
  "limit",
  "localtime",
  "localtimestamp",
  "natural",
  "not",
  "notnull",
  "null",
  "offset",
  "on",
  "only",
  "or",
  "order",
  "outer",
  "overlaps",
  "placing",
  "primary",
  "references",
  "returning",
  "right",
  "select",
  "session_user",
  "similar",
  "some",
  "symmetric",
  "system_user",
  "table",
  "tablesample",
  "then",
  "to",
  "trailing",
  "true",
  "union",
  "unique",
  "user",
  "using",
  "variadic",
  "verbose",
  "when",
  "where",
  "window",
  "with",
]);
// Characters after which an inserted identifier needs no separating space.
const NO_SPACE_BEFORE = new Set(["(", ",", ".", " ", "\n", "\t", "\r", ""]);

/** Quotes an identifier only when PostgreSQL would otherwise misread it. */
function quoteIdentifier(name: string): string {
  if (PLAIN_IDENTIFIER.test(name) && !RESERVED_WORDS.has(name)) {
    return name;
  }
  return `"${name.replaceAll('"', '""')}"`;
}

/** `public` relations are inserted bare; anything else is schema-qualified. */
function qualifiedRelationName(relation: CatalogRelation): string {
  const name = quoteIdentifier(relation.name);
  return relation.schema === DEFAULT_SCHEMA
    ? name
    : `${quoteIdentifier(relation.schema)}.${name}`;
}

/** Prefixes a space when the text would otherwise fuse with the token before it. */
function padInsertion(charBefore: string, text: string): string {
  return NO_SPACE_BEFORE.has(charBefore) ? text : ` ${text}`;
}

function sampleStatement(relation: CatalogRelation): string {
  return `SELECT *\nFROM ${qualifiedRelationName(relation)}\nLIMIT ${SAMPLE_ROW_LIMIT};`;
}

function relationKey(relation: CatalogRelation): string {
  return `${relation.schema}.${relation.name}`;
}

function compareRelations(a: CatalogRelation, b: CatalogRelation): number {
  if (a.kind !== b.kind) {
    return a.kind === "table" ? -1 : 1;
  }
  return a.name.localeCompare(b.name);
}

function compareSchemas(a: CatalogSchemaNode, b: CatalogSchemaNode): number {
  if (a.isSystem !== b.isSystem) {
    return a.isSystem ? 1 : -1;
  }
  return a.id.localeCompare(b.id);
}

/** Groups catalog objects under their schemas: user schemas first, tables before views. */
function buildCatalogTree(
  schemas: readonly CatalogSchema[],
  objects: readonly CatalogObject[]
): CatalogSchemaNode[] {
  const nodes = new Map<string, CatalogSchemaNode>();
  for (const schema of schemas) {
    nodes.set(schema.schemaId, {
      id: schema.schemaId,
      isSystem: schema.isSystemSchema,
      relations: [],
    });
  }
  for (const object of objects) {
    let node = nodes.get(object.schemaId);
    if (!node) {
      node = { id: object.schemaId, isSystem: object.isSystem, relations: [] };
      nodes.set(object.schemaId, node);
    }
    node.relations.push({
      isMaterialized: object.isMaterialized,
      kind: object.kind,
      name: object.objectId,
      schema: object.schemaId,
    });
  }
  const tree = [...nodes.values()];
  for (const node of tree) {
    node.relations.sort(compareRelations);
  }
  return tree.sort(compareSchemas);
}

function matches(value: string, query: string): boolean {
  return value.toLowerCase().includes(query);
}

/**
 * Keeps schemas whose name matches (with all their relations) and relations
 * whose bare or qualified name matches. An empty query returns the tree as is.
 */
function filterCatalogTree(
  tree: readonly CatalogSchemaNode[],
  query: string
): CatalogSchemaNode[] {
  const normalized = query.trim().toLowerCase();
  if (normalized === "") {
    return [...tree];
  }
  const filtered: CatalogSchemaNode[] = [];
  for (const node of tree) {
    if (matches(node.id, normalized)) {
      filtered.push(node);
      continue;
    }
    const relations = node.relations.filter(
      (relation) =>
        matches(relation.name, normalized) ||
        matches(relationKey(relation), normalized)
    );
    if (relations.length > 0) {
      filtered.push({ ...node, relations });
    }
  }
  return filtered;
}

export type { CatalogRelation, CatalogSchemaNode };
export {
  buildCatalogTree,
  filterCatalogTree,
  padInsertion,
  qualifiedRelationName,
  quoteIdentifier,
  relationKey,
  sampleStatement,
};
