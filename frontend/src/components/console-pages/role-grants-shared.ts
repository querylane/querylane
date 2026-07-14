import {
  Box,
  Code,
  Database,
  ExternalLink,
  Eye,
  FolderTree,
  Hash,
  Layers,
  Table2,
} from "lucide-react";
import type { ComponentType } from "react";
import type { GrantsType } from "@/components/console-pages/role-detail-search";
import {
  DefaultPrivilegeObjectType,
  GrantObjectType,
  type ObjectGrant,
  type OwnedObject,
  type RoleDefaultPrivilege,
} from "@/protogen/querylane/console/v1alpha1/role_pb";

// ───────── Internal constants (kept before exports per useExportsLast) ─────────

// Canonical relation privilege vocabulary, shared by table-like object types.
const RELATION_PRIVILEGES = [
  "SELECT",
  "INSERT",
  "UPDATE",
  "DELETE",
  "TRUNCATE",
  "REFERENCES",
  "TRIGGER",
];

// Canonical privilege vocabulary per object type. The set rendered for a group
// is this list plus any privilege actually present in the data, so newer
// privileges (e.g. PostgreSQL 17 MAINTAIN) appear only when granted.
const GRANT_VOCAB: Partial<Record<GrantObjectType, string[]>> = {
  [GrantObjectType.DATABASE]: ["CONNECT", "CREATE", "TEMPORARY"],
  [GrantObjectType.SCHEMA]: ["USAGE", "CREATE"],
  [GrantObjectType.TABLE]: RELATION_PRIVILEGES,
  [GrantObjectType.VIEW]: RELATION_PRIVILEGES,
  [GrantObjectType.MATERIALIZED_VIEW]: RELATION_PRIVILEGES,
  [GrantObjectType.FOREIGN_TABLE]: RELATION_PRIVILEGES,
  [GrantObjectType.SEQUENCE]: ["USAGE", "SELECT", "UPDATE"],
  [GrantObjectType.FUNCTION]: ["EXECUTE"],
  [GrantObjectType.LARGE_OBJECT]: ["SELECT", "UPDATE"],
};

const MIN_SAMPLE_ROWS = 8;
const ABBR_FALLBACK_LENGTH = 3;
const DATABASE_SCOPE_SCHEMA = "database";

// Abbreviations keep the density strips legible (a popover explains them).
const PRIV_ABBR: Record<string, string> = {
  CONNECT: "CON",
  CREATE: "CRT",
  DELETE: "DEL",
  EXECUTE: "EXE",
  INSERT: "INS",
  MAINTAIN: "MNT",
  REFERENCES: "REF",
  SELECT: "SEL",
  TEMPORARY: "TMP",
  TRIGGER: "TRG",
  TRUNCATE: "TRN",
  UPDATE: "UPD",
  USAGE: "USE",
};

// Plain-language gloss per privilege, for the pill tooltips (the strips
// abbreviate, e.g. SEL → "SELECT — read rows").
const PRIV_DESCRIPTION: Record<string, string> = {
  CONNECT: "connect to the database",
  CREATE: "create objects",
  DELETE: "remove rows",
  EXECUTE: "call the function",
  INSERT: "add rows",
  MAINTAIN: "VACUUM, ANALYZE, REINDEX",
  REFERENCES: "create foreign keys",
  SELECT: "read rows",
  TEMPORARY: "create temporary tables",
  TRIGGER: "create triggers",
  TRUNCATE: "empty the table",
  UPDATE: "modify rows",
  USAGE: "use the schema or sequence",
};

const BREAKDOWN_ORDER: GrantObjectType[] = [
  GrantObjectType.TABLE,
  GrantObjectType.VIEW,
  GrantObjectType.MATERIALIZED_VIEW,
  GrantObjectType.SEQUENCE,
  GrantObjectType.FOREIGN_TABLE,
  GrantObjectType.FUNCTION,
];

function databaseScopeBreakdownLabel(group: SchemaGrantGroup): string {
  const parts: string[] = [];
  if (group.byType.has(GrantObjectType.DATABASE)) {
    parts.push("database-level grant");
  }

  const largeObjectCount =
    group.byType.get(GrantObjectType.LARGE_OBJECT)?.length ?? 0;
  if (largeObjectCount > 0) {
    parts.push(
      `${largeObjectCount.toLocaleString()} large object${largeObjectCount === 1 ? "" : "s"}`
    );
  }

  return parts.join(" · ");
}

function schemaScopeBreakdownLabel(group: SchemaGrantGroup): string {
  const parts: string[] = [];
  for (const type of BREAKDOWN_ORDER) {
    const count = group.byType.get(type)?.length ?? 0;
    if (count > 0) {
      const unit = TYPE_UNIT[type] ?? "object";
      parts.push(`${count.toLocaleString()} ${unit}${count === 1 ? "" : "s"}`);
    }
  }
  if (group.byType.has(GrantObjectType.SCHEMA)) {
    parts.push("schema-level grant");
  }
  return parts.join(" · ");
}

// ───────── Access-facet load state ─────────

// The owned-objects / PUBLIC-grants / default-privileges facets are fetched as
// queries independent of the direct grants, so each can be idle, loading, or
// failed on its own. "ready" also covers the intentionally-disabled case (e.g.
// system roles), where an empty result is the answer rather than a pending fetch.
export type FacetState = "idle" | "loading" | "error" | "ready";

export interface FacetStates {
  defaults: FacetState;
  owned: FacetState;
  publicGrants: FacetState;
}

// ───────── Aggregated grant shape ─────────

export interface GrantedObject {
  // Distinct roles that granted any privilege on this object (the ACL grantor).
  grantors: string[];
  key: string;
  objectName: string;
  objectType: GrantObjectType;
  privileges: { grantable: boolean; name: string }[];
  schemaName: string;
}

// Relation-like object types (table / view / matview / foreign table) — used to
// derive the role's read-vs-write access posture.
export const TABLE_LIKE_TYPES = new Set<GrantObjectType>([
  GrantObjectType.TABLE,
  GrantObjectType.VIEW,
  GrantObjectType.MATERIALIZED_VIEW,
  GrantObjectType.FOREIGN_TABLE,
]);

// Aggregate the flat grant rows (one per object+privilege+grantor) into
// per-object rows. Rows arrive pre-sorted (schema_name, object_name,
// privilege), so insertion order yields a schema-grouped display order.
export function aggregateGrants(grants: ObjectGrant[]): GrantedObject[] {
  const objects = new Map<string, GrantedObject>();
  for (const grant of grants) {
    // Tuple key, not a delimiter-joined string: Postgres identifiers can contain
    // spaces, so a JSON array keeps distinct (type, schema, object) triples apart.
    const key = JSON.stringify([
      grant.objectType,
      grant.schemaName,
      grant.objectName,
    ]);
    let object = objects.get(key);
    if (!object) {
      object = {
        grantors: [],
        key,
        objectName: grant.objectName,
        objectType: grant.objectType,
        privileges: [],
        schemaName: grant.schemaName,
      };
      objects.set(key, object);
    }
    object.privileges.push({
      grantable: grant.withGrantOption,
      name: grant.privilege,
    });
    if (grant.grantor && !object.grantors.includes(grant.grantor)) {
      object.grantors.push(grant.grantor);
    }
  }
  return [...objects.values()];
}

// ───────── Object metadata ─────────

export const GRANT_OBJECT_META: Record<
  GrantObjectType,
  { icon: ComponentType<{ className?: string }>; label: string }
> = {
  [GrantObjectType.UNSPECIFIED]: { icon: Box, label: "Object" },
  [GrantObjectType.DATABASE]: { icon: Database, label: "Database" },
  [GrantObjectType.SCHEMA]: { icon: FolderTree, label: "Schema" },
  [GrantObjectType.TABLE]: { icon: Table2, label: "Table" },
  [GrantObjectType.VIEW]: { icon: Eye, label: "View" },
  [GrantObjectType.MATERIALIZED_VIEW]: {
    icon: Layers,
    label: "Materialized view",
  },
  [GrantObjectType.SEQUENCE]: { icon: Hash, label: "Sequence" },
  [GrantObjectType.FOREIGN_TABLE]: {
    icon: ExternalLink,
    label: "Foreign table",
  },
  [GrantObjectType.FUNCTION]: { icon: Code, label: "Function" },
  [GrantObjectType.LARGE_OBJECT]: { icon: Box, label: "Large object" },
};

export const getObjectTypeLabel = (objectType: GrantObjectType): string =>
  (
    GRANT_OBJECT_META[objectType] ??
    GRANT_OBJECT_META[GrantObjectType.UNSPECIFIED]
  ).label;

// Ordered groups + plain-language hints shown as section headers.
export const GRANT_GROUPS: {
  hint: string;
  title: string;
  type: GrantObjectType;
}[] = [
  {
    hint: "Privileges on the database object itself.",
    title: "On the database",
    type: GrantObjectType.DATABASE,
  },
  {
    hint: "USAGE lets the role see objects inside; CREATE lets it add new ones.",
    title: "On schemas",
    type: GrantObjectType.SCHEMA,
  },
  {
    hint: "One row per table — Postgres tracks grants per table, not per schema.",
    title: "On tables",
    type: GrantObjectType.TABLE,
  },
  {
    hint: "Views are grantable independently of their underlying tables.",
    title: "On views",
    type: GrantObjectType.VIEW,
  },
  {
    hint: "Grantable like tables; SELECT reads the stored result.",
    title: "On materialized views",
    type: GrantObjectType.MATERIALIZED_VIEW,
  },
  {
    hint: "USAGE / SELECT / UPDATE — needed for SERIAL and IDENTITY columns.",
    title: "On sequences",
    type: GrantObjectType.SEQUENCE,
  },
  {
    hint: "Tables backed by an external data source.",
    title: "On foreign tables",
    type: GrantObjectType.FOREIGN_TABLE,
  },
  {
    hint: "EXECUTE is required to call the function or procedure.",
    title: "On functions",
    type: GrantObjectType.FUNCTION,
  },
  {
    hint: "Database-scoped objects addressed by OID.",
    title: "On large objects",
    type: GrantObjectType.LARGE_OBJECT,
  },
];

// Object-type groups rendered flat (the rows ARE the objects) vs. grouped by
// schema (one collapsible schema section per schema, with density rollups).
export const FLAT_TYPES = new Set<GrantObjectType>([
  GrantObjectType.DATABASE,
  GrantObjectType.SCHEMA,
  GrantObjectType.LARGE_OBJECT,
]);

export const RELATION_TYPES = new Set<GrantObjectType>([
  GrantObjectType.TABLE,
  GrantObjectType.VIEW,
  GrantObjectType.MATERIALIZED_VIEW,
  GrantObjectType.SEQUENCE,
  GrantObjectType.FOREIGN_TABLE,
  GrantObjectType.FUNCTION,
]);

export const TYPE_UNIT: Partial<Record<GrantObjectType, string>> = {
  [GrantObjectType.TABLE]: "table",
  [GrantObjectType.VIEW]: "view",
  [GrantObjectType.MATERIALIZED_VIEW]: "materialized view",
  [GrantObjectType.SEQUENCE]: "sequence",
  [GrantObjectType.FOREIGN_TABLE]: "foreign table",
  [GrantObjectType.FUNCTION]: "function",
  [GrantObjectType.LARGE_OBJECT]: "large object",
};

// Stable URL slug per object type — the Grants schema view encodes its active
// type tab as `grantsType` so the drill-in is deep-linkable.
export const SLUG_TO_OBJECT_TYPE: Record<GrantsType, GrantObjectType> = {
  database: GrantObjectType.DATABASE,
  "foreign-tables": GrantObjectType.FOREIGN_TABLE,
  functions: GrantObjectType.FUNCTION,
  "large-objects": GrantObjectType.LARGE_OBJECT,
  matviews: GrantObjectType.MATERIALIZED_VIEW,
  schema: GrantObjectType.SCHEMA,
  sequences: GrantObjectType.SEQUENCE,
  tables: GrantObjectType.TABLE,
  views: GrantObjectType.VIEW,
};

export function slugForObjectType(
  type: GrantObjectType
): GrantsType | undefined {
  return (Object.keys(SLUG_TO_OBJECT_TYPE) as GrantsType[]).find(
    (slug) => SLUG_TO_OBJECT_TYPE[slug] === type
  );
}

// A schema at or under this size opens inline; above it stays collapsed and
// gains an inline filter bar when opened. Baked-in (no user tweak).
export const AUTO_EXPAND_THRESHOLD = 12;
export const MAX_SAMPLE_ROWS = Math.max(AUTO_EXPAND_THRESHOLD, MIN_SAMPLE_ROWS);
export const EXAMPLE_LIMIT = 4;

export function privAbbr(name: string): string {
  return PRIV_ABBR[name] ?? name.slice(0, ABBR_FALLBACK_LENGTH);
}

// Tooltip text for a privilege pill: full name + a plain-language gloss.
export function privTooltip(name: string): string {
  const description = PRIV_DESCRIPTION[name];
  return description ? `${name} — ${description}` : name;
}

// ───────── Privilege tone ─────────
// Reads cool (emerald), writes warm (amber), destructive flagged (red), CREATE
// distinct (violet). Matches the rest of the app's privilege colouring.
export type PrivTone = "read" | "write" | "destructive" | "create" | "default";
export function privTone(name: string): PrivTone {
  if (
    name === "SELECT" ||
    name === "USAGE" ||
    name === "CONNECT" ||
    name === "EXECUTE"
  ) {
    return "read";
  }
  if (
    name === "INSERT" ||
    name === "UPDATE" ||
    name === "REFERENCES" ||
    name === "TRIGGER" ||
    name === "TEMPORARY" ||
    name === "MAINTAIN"
  ) {
    return "write";
  }
  if (name === "DELETE" || name === "TRUNCATE") {
    return "destructive";
  }
  if (name === "CREATE") {
    return "create";
  }
  return "default";
}

export const PRIV_TONE_CLASS: Record<PrivTone, string> = {
  create:
    "border-violet-500/30 bg-violet-500/10 text-violet-700 dark:text-violet-300",
  default: "border-border bg-muted text-foreground",
  destructive: "border-red-500/30 bg-red-500/10 text-red-700 dark:text-red-400",
  read: "border-emerald-500/30 bg-emerald-500/10 text-emerald-700 dark:text-emerald-400",
  write:
    "border-amber-500/30 bg-amber-500/10 text-amber-700 dark:text-amber-400",
};

// Partial density: held on some-but-not-all objects in a schema/group rollup.
export const PRIV_TONE_PARTIAL_CLASS: Record<PrivTone, string> = {
  create:
    "border-violet-500/20 bg-violet-500/5 text-violet-600/80 dark:text-violet-300/80",
  default: "border-border/70 bg-muted/50 text-muted-foreground",
  destructive:
    "border-red-500/20 bg-red-500/5 text-red-600/80 dark:text-red-400/80",
  read: "border-emerald-500/20 bg-emerald-500/5 text-emerald-600/80 dark:text-emerald-400/80",
  write:
    "border-amber-500/20 bg-amber-500/5 text-amber-600/80 dark:text-amber-400/80",
};

// ───────── Data helpers ─────────

export function objectDisplayName(object: GrantedObject): string {
  if (object.objectType === GrantObjectType.SCHEMA) {
    return object.schemaName;
  }
  if (object.objectType === GrantObjectType.DATABASE || !object.schemaName) {
    return object.objectName;
  }
  return `${object.schemaName}.${object.objectName}`;
}

// Distinct, grant-option-aware privileges for one object (a privilege can
// appear once per grantor; collapse to one pill, keeping any grant option).
export function dedupePrivileges(
  privileges: { grantable: boolean; name: string }[]
): { grantable: boolean; name: string }[] {
  const map = new Map<string, boolean>();
  for (const privilege of privileges) {
    map.set(
      privilege.name,
      (map.get(privilege.name) ?? false) || privilege.grantable
    );
  }
  return [...map.entries()].map(([name, grantable]) => ({ grantable, name }));
}

// Condense the distinct grantors of an object's privileges for display.
export function grantorSummary(
  grantors: string[]
): { text: string; title: string | undefined } | null {
  if (grantors.length === 0) {
    return null;
  }
  if (grantors.length === 1) {
    return { text: grantors[0] ?? "", title: undefined };
  }
  return { text: `${grantors.length} roles`, title: grantors.join(", ") };
}

// Dominant grantor across a set of objects, with a "+N" suffix when several
// roles granted access in the same schema.
export function dominantGrantor(objects: GrantedObject[]): string | null {
  const counts = new Map<string, number>();
  for (const object of objects) {
    for (const grantor of object.grantors) {
      counts.set(grantor, (counts.get(grantor) ?? 0) + 1);
    }
  }
  if (counts.size === 0) {
    return null;
  }
  const sorted = [...counts.entries()].sort((a, b) => b[1] - a[1]);
  const top = sorted[0]?.[0] ?? "";
  return sorted.length > 1 ? `${top} +${sorted.length - 1}` : top;
}

// Column set for a group = canonical vocabulary + any privilege present in data.
export function columnsFor(
  type: GrantObjectType,
  objects: GrantedObject[]
): string[] {
  const columns = [...(GRANT_VOCAB[type] ?? [])];
  for (const object of objects) {
    for (const privilege of object.privileges) {
      if (!columns.includes(privilege.name)) {
        columns.push(privilege.name);
      }
    }
  }
  return columns;
}

// For each column, how many objects in the set hold that privilege.
export function densityCounts(
  objects: GrantedObject[],
  columns: string[]
): Record<string, number> {
  const out: Record<string, number> = {};
  for (const column of columns) {
    out[column] = 0;
  }
  for (const object of objects) {
    const seen = new Set<string>();
    for (const privilege of object.privileges) {
      if (seen.has(privilege.name)) {
        continue;
      }
      seen.add(privilege.name);
      if (privilege.name in out) {
        out[privilege.name] = (out[privilege.name] ?? 0) + 1;
      }
    }
  }
  return out;
}

export type PillState = "held" | "full" | "partial" | "none";
export function densityState(count: number, total: number): PillState {
  if (count === 0) {
    return "none";
  }
  if (count >= total) {
    return "full";
  }
  return "partial";
}

// Group objects by schema, preserving the (pre-sorted) insertion order.
export function groupBySchema(
  objects: GrantedObject[]
): [string, GrantedObject[]][] {
  const map = new Map<string, GrantedObject[]>();
  for (const object of objects) {
    const list = map.get(object.schemaName);
    if (list) {
      list.push(object);
    } else {
      map.set(object.schemaName, [object]);
    }
  }
  return [...map.entries()];
}

export function objectMatchesFilters(
  object: GrantedObject,
  needle: string,
  grantOnly: boolean,
  activePrivs: string[]
): boolean {
  if (needle && !objectDisplayName(object).toLowerCase().includes(needle)) {
    return false;
  }
  if (grantOnly && !object.privileges.some((p) => p.grantable)) {
    return false;
  }
  if (
    activePrivs.length > 0 &&
    !activePrivs.every((name) => object.privileges.some((p) => p.name === name))
  ) {
    return false;
  }
  return true;
}

// ───────── Schema index (overview + schema drill-in) ─────────

export interface SchemaGrantGroup {
  byType: Map<GrantObjectType, GrantedObject[]>;
  // The synthetic database-level row (object_type DATABASE, no schema).
  database: boolean;
  objects: GrantedObject[];
  schema: string;
  total: number;
}

// Per-schema rollup of the role's direct grants. DATABASE-level grants (which
// have no schema) collapse into a single synthetic database row; SCHEMA-level
// grants belong to their own schema's group.
export function buildSchemaIndex(objects: GrantedObject[]): SchemaGrantGroup[] {
  const groups = new Map<string, SchemaGrantGroup>();
  const ensure = (schema: string, database: boolean): SchemaGrantGroup => {
    const key = JSON.stringify([database ? "database" : "schema", schema]);
    let group = groups.get(key);
    if (!group) {
      group = {
        byType: new Map(),
        database,
        objects: [],
        schema,
        total: 0,
      };
      groups.set(key, group);
    }
    return group;
  };
  for (const object of objects) {
    const isDatabaseScope =
      object.objectType === GrantObjectType.DATABASE ||
      object.objectType === GrantObjectType.LARGE_OBJECT;
    const schema = isDatabaseScope ? DATABASE_SCOPE_SCHEMA : object.schemaName;
    const group = ensure(schema, isDatabaseScope);
    group.objects.push(object);
    group.total += 1;
    const list = group.byType.get(object.objectType);
    if (list) {
      list.push(object);
    } else {
      group.byType.set(object.objectType, [object]);
    }
  }
  // Database row first, then schemas in encounter order.
  return [...groups.values()].sort((a, b) => {
    if (a.database !== b.database) {
      return a.database ? -1 : 1;
    }
    return 0;
  });
}

// "5 tables · 3 views · schema-level grant" — the per-schema breakdown sub-line.
export function schemaBreakdownLabel(group: SchemaGrantGroup): string {
  if (group.database) {
    return databaseScopeBreakdownLabel(group);
  }
  return schemaScopeBreakdownLabel(group);
}

// ───────── Owned objects ─────────

export const OWNED_TYPE_ORDER: GrantObjectType[] = [
  GrantObjectType.DATABASE,
  GrantObjectType.SCHEMA,
  GrantObjectType.TABLE,
  GrantObjectType.VIEW,
  GrantObjectType.MATERIALIZED_VIEW,
  GrantObjectType.SEQUENCE,
  GrantObjectType.FOREIGN_TABLE,
  GrantObjectType.FUNCTION,
  GrantObjectType.LARGE_OBJECT,
];

export function ownedObjectName(object: OwnedObject): string {
  if (
    object.objectType === GrantObjectType.SCHEMA ||
    object.objectType === GrantObjectType.DATABASE
  ) {
    return object.schemaName || object.objectName;
  }
  return object.objectName;
}

export interface OwnedStat {
  count: number;
  examples: string;
  label: string;
  type: GrantObjectType;
}

export function ownedStats(objects: OwnedObject[]): OwnedStat[] {
  const byType = new Map<GrantObjectType, string[]>();
  for (const object of objects) {
    const list = byType.get(object.objectType);
    const name = ownedObjectName(object);
    if (list) {
      list.push(name);
    } else {
      byType.set(object.objectType, [name]);
    }
  }
  return OWNED_TYPE_ORDER.filter((type) => byType.has(type)).map((type) => {
    const names = byType.get(type) ?? [];
    const extra = names.length - EXAMPLE_LIMIT;
    const examples =
      names.slice(0, EXAMPLE_LIMIT).join(", ") +
      (extra > 0 ? ` +${extra}` : "");
    return {
      count: names.length,
      examples,
      label: `${getObjectTypeLabel(type).toLowerCase()}${names.length === 1 ? "" : "s"}`,
      type,
    };
  });
}

// ───────── Default privileges ─────────

export const DEFAULT_PRIV_OBJECT_LABEL: Record<
  DefaultPrivilegeObjectType,
  string
> = {
  [DefaultPrivilegeObjectType.UNSPECIFIED]: "objects",
  [DefaultPrivilegeObjectType.TABLES]: "tables",
  [DefaultPrivilegeObjectType.SEQUENCES]: "sequences",
  [DefaultPrivilegeObjectType.FUNCTIONS]: "functions",
  [DefaultPrivilegeObjectType.TYPES]: "types",
  [DefaultPrivilegeObjectType.SCHEMAS]: "schemas",
  [DefaultPrivilegeObjectType.LARGE_OBJECTS]: "large objects",
};

export interface DefaultPrivilegeRule {
  creatorRoleName: string;
  key: string;
  objectType: DefaultPrivilegeObjectType;
  privileges: { grantable: boolean; name: string }[];
  schemaName: string;
}

// Group the flat default-privilege rows into one rule per (creator, type,
// schema) so each renders as a single sentence.
export function groupDefaultPrivileges(
  rows: RoleDefaultPrivilege[]
): DefaultPrivilegeRule[] {
  const rules = new Map<string, DefaultPrivilegeRule>();
  for (const row of rows) {
    // Tuple key: creator/schema identifiers can contain ':' — see aggregateGrants.
    const key = JSON.stringify([
      row.creatorRoleName,
      row.objectType,
      row.schemaName,
    ]);
    let rule = rules.get(key);
    if (!rule) {
      rule = {
        creatorRoleName: row.creatorRoleName,
        key,
        objectType: row.objectType,
        privileges: [],
        schemaName: row.schemaName,
      };
      rules.set(key, rule);
    }
    rule.privileges.push({
      grantable: row.withGrantOption,
      name: row.privilege,
    });
  }
  return [...rules.values()];
}
