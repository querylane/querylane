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
import {
  type GrantsType,
  roleDetailSearchSchema,
} from "@/components/console-pages/role-detail-search";
import { isNonEmptyString } from "@/lib/value-guards";
import {
  DefaultPrivilegeObjectType,
  GrantObjectType,
  type ObjectGrant,
  type OwnedObject,
  type RoleDefaultPrivilege,
} from "@/protogen/querylane/console/v1alpha1/role_pb";

const RELATION_PRIVILEGES = [
  "SELECT",
  "INSERT",
  "UPDATE",
  "DELETE",
  "TRUNCATE",
  "REFERENCES",
  "TRIGGER",
];

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

function databaseScopeBreakdownLabel(group: SchemaGrantGroup) {
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

function schemaScopeBreakdownLabel(group: SchemaGrantGroup) {
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

function addObjectPrivilegeCounts(
  counts: Record<string, number>,
  object: GrantedObject
) {
  const seen = new Set<string>();
  for (const privilege of object.privileges) {
    if (seen.has(privilege.name)) {
      continue;
    }
    seen.add(privilege.name);
    if (privilege.name in counts) {
      counts[privilege.name] = (counts[privilege.name] ?? 0) + 1;
    }
  }
}

function presentOwnedStat(type: GrantObjectType, names: string[]) {
  const extra = names.length - EXAMPLE_LIMIT;
  const examples =
    names.slice(0, EXAMPLE_LIMIT).join(", ") + (extra > 0 ? ` +${extra}` : "");
  return {
    count: names.length,
    examples,
    label: `${getObjectTypeLabel(type).toLowerCase()}${names.length === 1 ? "" : "s"}`,
    type,
  } satisfies OwnedStat;
}

export type FacetState = "idle" | "loading" | "error" | "ready";

export interface FacetStates {
  defaults: FacetState;
  owned: FacetState;
  publicGrants: FacetState;
}

export interface GrantedObject {
  grantors: string[];
  key: string;
  objectName: string;
  objectType: GrantObjectType;
  privileges: {
    grantable: boolean;
    name: string;
  }[];
  schemaName: string;
}

export const TABLE_LIKE_TYPES = new Set<GrantObjectType>([
  GrantObjectType.TABLE,
  GrantObjectType.VIEW,
  GrantObjectType.MATERIALIZED_VIEW,
  GrantObjectType.FOREIGN_TABLE,
]);

export function aggregateGrants(grants: ObjectGrant[]) {
  const objects = new Map<string, GrantedObject>();
  const grantorsByObject = new Map<string, Set<string>>();
  for (const grant of grants) {
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
      grantorsByObject.set(key, new Set());
    }
    object.privileges.push({
      grantable: grant.withGrantOption,
      name: grant.privilege,
    });
    const grantors = grantorsByObject.get(key);
    if (grant.grantor && grantors && !grantors.has(grant.grantor)) {
      grantors.add(grant.grantor);
      object.grantors.push(grant.grantor);
    }
  }
  return [...objects.values()] satisfies GrantedObject[];
}

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

export const getObjectTypeLabel = (objectType: GrantObjectType) =>
  (
    GRANT_OBJECT_META[objectType] ??
    GRANT_OBJECT_META[GrantObjectType.UNSPECIFIED]
  ).label;

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

export function slugForObjectType(type: GrantObjectType) {
  const slug = Object.entries(SLUG_TO_OBJECT_TYPE).find(
    ([, objectType]) => objectType === type
  )?.[0];
  return roleDetailSearchSchema.shape.grantsType.parse(slug);
}

export function grantObjectTypeFilterToken(type: GrantObjectType) {
  switch (type) {
    case GrantObjectType.DATABASE:
      return "DATABASE";
    case GrantObjectType.SCHEMA:
      return "SCHEMA";
    case GrantObjectType.TABLE:
      return "TABLE";
    case GrantObjectType.VIEW:
      return "VIEW";
    case GrantObjectType.MATERIALIZED_VIEW:
      return "MATERIALIZED_VIEW";
    case GrantObjectType.SEQUENCE:
      return "SEQUENCE";
    case GrantObjectType.FOREIGN_TABLE:
      return "FOREIGN_TABLE";
    case GrantObjectType.FUNCTION:
      return "FUNCTION";
    case GrantObjectType.LARGE_OBJECT:
      return "LARGE_OBJECT";
    case GrantObjectType.UNSPECIFIED:
    default:
      return undefined;
  }
}

export function grantObjectTypeFilterTokenForSlug(slug: string) {
  const objectType = Object.entries(SLUG_TO_OBJECT_TYPE).find(
    ([candidate]) => candidate === slug
  )?.[1];
  return objectType === undefined
    ? undefined
    : grantObjectTypeFilterToken(objectType);
}

export const AUTO_EXPAND_THRESHOLD = 12;
export const MAX_SAMPLE_ROWS = Math.max(AUTO_EXPAND_THRESHOLD, MIN_SAMPLE_ROWS);
export const EXAMPLE_LIMIT = 4;

export function privAbbr(name: string) {
  return PRIV_ABBR[name] ?? name.slice(0, ABBR_FALLBACK_LENGTH);
}

export function privTooltip(name: string) {
  const description = PRIV_DESCRIPTION[name];
  return isNonEmptyString(description) ? `${name} — ${description}` : name;
}

export type PrivTone = "read" | "write" | "destructive" | "create" | "default";
export function privTone(name: string) {
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
    "border-permission-500/30 bg-permission-500/10 text-permission-700 dark:text-permission-300",
  default: "border-border bg-muted text-foreground",
  destructive:
    "border-negative-500/30 bg-negative-500/10 text-negative-700 dark:text-negative-400",
  read: "border-positive-500/30 bg-positive-500/10 text-positive-700 dark:text-positive-400",
  write:
    "border-warning-500/30 bg-warning-500/10 text-warning-700 dark:text-warning-400",
};

export function objectDisplayName(object: GrantedObject) {
  if (object.objectType === GrantObjectType.SCHEMA) {
    return object.schemaName;
  }
  if (object.objectType === GrantObjectType.DATABASE || !object.schemaName) {
    return object.objectName;
  }
  return `${object.schemaName}.${object.objectName}`;
}

export function dedupePrivileges(
  privileges: {
    grantable: boolean;
    name: string;
  }[]
) {
  const map = new Map<string, boolean>();
  for (const privilege of privileges) {
    map.set(
      privilege.name,
      (map.get(privilege.name) ?? false) || privilege.grantable
    );
  }
  return [...map.entries()].map(([name, grantable]) => ({ grantable, name }));
}

export function grantorSummary(grantors: string[]) {
  if (grantors.length === 0) {
    return null;
  }
  if (grantors.length === 1) {
    return { text: grantors[0] ?? "", title: undefined } satisfies {
      text: string;
      title: string | undefined;
    } | null;
  }
  return {
    text: `${grantors.length} roles`,
    title: grantors.join(", "),
  } satisfies { text: string; title: string | undefined } | null;
}

export function dominantGrantor(objects: GrantedObject[]) {
  const counts = new Map<string, number>();
  for (const object of objects) {
    for (const grantor of object.grantors) {
      counts.set(grantor, (counts.get(grantor) ?? 0) + 1);
    }
  }
  if (counts.size === 0) {
    return null;
  }
  const sorted = [...counts.entries()].toSorted((a, b) => b[1] - a[1]);
  const top = sorted[0]?.[0] ?? "";
  return sorted.length > 1 ? `${top} +${sorted.length - 1}` : top;
}

export function columnsFor(type: GrantObjectType, objects: GrantedObject[]) {
  const columns = [...(GRANT_VOCAB[type] ?? [])];
  const columnSet = new Set(columns);
  for (const object of objects) {
    for (const privilege of object.privileges) {
      if (!columnSet.has(privilege.name)) {
        columnSet.add(privilege.name);
        columns.push(privilege.name);
      }
    }
  }
  return columns;
}

export function densityCounts(objects: GrantedObject[], columns: string[]) {
  const counts = Object.fromEntries(columns.map((column) => [column, 0]));
  for (const object of objects) {
    addObjectPrivilegeCounts(counts, object);
  }
  return counts;
}

export type PillState = "held" | "full" | "partial" | "none";
export function densityState(count: number, total: number) {
  if (count === 0) {
    return "none";
  }
  if (count >= total) {
    return "full";
  }
  return "partial";
}

export function groupBySchema(objects: GrantedObject[]) {
  const map = new Map<string, GrantedObject[]>();
  for (const object of objects) {
    const list = map.get(object.schemaName);
    if (list) {
      list.push(object);
    } else {
      map.set(object.schemaName, [object]);
    }
  }
  return [...map.entries()] satisfies [string, GrantedObject[]][];
}

export function objectMatchesFilters({
  object,
  needle,
  grantOnly,
  activePrivs,
}: {
  object: GrantedObject;
  needle: string;
  grantOnly: boolean;
  activePrivs: string[];
}) {
  if (needle && !objectDisplayName(object).toLowerCase().includes(needle)) {
    return false;
  }
  if (grantOnly && object.privileges.every((p) => !p.grantable)) {
    return false;
  }
  if (
    activePrivs.some((name) => object.privileges.every((p) => p.name !== name))
  ) {
    return false;
  }
  return true;
}

export interface SchemaGrantGroup {
  byType: Map<GrantObjectType, GrantedObject[]>;
  database: boolean;
  objects: GrantedObject[];
  schema: string;
  total: number;
}

export function buildSchemaIndex(objects: GrantedObject[]) {
  const groups = new Map<string, SchemaGrantGroup>();
  const ensure = (schema: string, database: boolean) => {
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
  return [...groups.values()].toSorted((a, b) => {
    if (a.database !== b.database) {
      return a.database ? -1 : 1;
    }
    return 0;
  });
}

export function schemaBreakdownLabel(group: SchemaGrantGroup) {
  if (group.database) {
    return databaseScopeBreakdownLabel(group);
  }
  return schemaScopeBreakdownLabel(group);
}

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

export function ownedObjectName(object: OwnedObject) {
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

export function ownedStats(objects: OwnedObject[]) {
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
  const stats: OwnedStat[] = [];
  for (const type of OWNED_TYPE_ORDER) {
    if (!byType.has(type)) {
      continue;
    }
    stats.push(presentOwnedStat(type, byType.get(type) ?? []));
  }
  return stats;
}

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
  privileges: {
    grantable: boolean;
    name: string;
  }[];
  schemaName: string;
}

export function groupDefaultPrivileges(rows: RoleDefaultPrivilege[]) {
  const rules = new Map<string, DefaultPrivilegeRule>();
  for (const row of rows) {
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
  return [...rules.values()] satisfies DefaultPrivilegeRule[];
}
