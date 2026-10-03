import {
  DEFAULT_SCHEMA,
  type SqlRelation,
  toSqlRelation,
} from "@/features/sql-workbench/sql-relation";
import type {
  CatalogObject,
  CatalogSchema,
} from "@/hooks/api/database-catalog";

interface CatalogSchemaNode {
  id: string;
  isSystem: boolean;
  relations: SqlRelation[];
}

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

/**
 * Relations in the tab's default schema are inserted bare; anything else is
 * schema-qualified. With a chosen default schema the backend's search_path is
 * that schema alone, so even `public` relations need their prefix then.
 */
function qualifiedRelationName(
  relation: SqlRelation,
  defaultSchema: string = DEFAULT_SCHEMA
): string {
  const name = quoteIdentifier(relation.name);
  return relation.schema === defaultSchema
    ? name
    : `${quoteIdentifier(relation.schema)}.${name}`;
}

/** Inserted names must not fuse with an adjacent identifier character. */
const IDENTIFIER_CHAR = /[\p{L}\p{N}_$"]/u;

/**
 * Pads an inserted name with spaces where it would otherwise fuse with the
 * token before or after the cursor.
 */
function padInsertion(
  charBefore: string,
  text: string,
  charAfter = ""
): string {
  const before = NO_SPACE_BEFORE.has(charBefore) ? "" : " ";
  const after = IDENTIFIER_CHAR.test(charAfter) ? " " : "";
  return `${before}${text}${after}`;
}

function sampleStatement(
  relation: SqlRelation,
  defaultSchema: string = DEFAULT_SCHEMA
): string {
  return `SELECT *\nFROM ${qualifiedRelationName(relation, defaultSchema)}\nLIMIT ${SAMPLE_ROW_LIMIT};`;
}

function compareRelations(a: SqlRelation, b: SqlRelation): number {
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
    node.relations.push(toSqlRelation(object));
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
        matches(`${relation.schema}.${relation.name}`, normalized)
    );
    if (relations.length > 0) {
      filtered.push({ ...node, relations });
    }
  }
  return filtered;
}

export type { CatalogSchemaNode };
export {
  buildCatalogTree,
  filterCatalogTree,
  padInsertion,
  qualifiedRelationName,
  quoteIdentifier,
  sampleStatement,
};
