import type { CatalogObject } from "@/hooks/api/database-catalog";

/**
 * A table or view as the SQL workbench sees it: the catalog rail, completion
 * and inserted names all work from this one shape.
 */
interface SqlRelation {
  isMaterialized: boolean;
  kind: "table" | "view";
  name: string;
  schema: string;
}

/** The schema unqualified names resolve against when a tab chose none. */
const DEFAULT_SCHEMA = "public";

/**
 * Map key for a relation. NUL cannot appear in a PostgreSQL identifier, so
 * `a.b` + `c` and `a` + `b.c` stay distinct (a `.` separator would merge them).
 */
function relationKey(relation: { name: string; schema: string }): string {
  return `${relation.schema}\u0000${relation.name}`;
}

function toSqlRelation(object: CatalogObject): SqlRelation {
  return {
    isMaterialized: object.isMaterialized,
    kind: object.kind,
    name: object.objectId,
    schema: object.schemaId,
  };
}

export type { SqlRelation };
export { DEFAULT_SCHEMA, relationKey, toSqlRelation };
