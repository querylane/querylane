type ContainsFilterField =
  | "display_name"
  | "name"
  | "object_name"
  | "role_name"
  | "schema_name";

type RoleFilterKind = "builtin" | "group" | "login" | "repl" | "super";

const MIN_SERVER_SUBSTRING_LENGTH = 2;
const SERVER_FILTER_DEBOUNCE_MS = 200;

function quoteFilterValue(value: string): string {
  return `"${value.replaceAll("\\", "\\\\").replaceAll('"', '\\"')}"`;
}

function buildContainsFilter(
  field: ContainsFilterField,
  value: string
): string | undefined {
  const trimmed = value.trim();
  if (trimmed.length < MIN_SERVER_SUBSTRING_LENGTH) {
    return;
  }
  return `${field}:${quoteFilterValue(trimmed)}`;
}

function joinFilterConditions(
  conditions: Array<string | undefined>
): string | undefined {
  const present = conditions.filter((condition) => condition !== undefined);
  return present.length === 0 ? undefined : present.join(" AND ");
}

function buildOwnedFilter({
  objectType,
  search,
}: {
  objectType?: string | undefined;
  search: string;
}): string | undefined {
  return joinFilterConditions([
    objectType ? `object_type = ${quoteFilterValue(objectType)}` : undefined,
    buildGrantSearchFilter(search),
  ]);
}

function buildGrantSearchFilter(search: string): string | undefined {
  const objectName = buildContainsFilter("object_name", search);
  if (!objectName) {
    return;
  }
  const schemaName = buildContainsFilter("schema_name", search);
  return `(${objectName} OR ${schemaName})`;
}

function buildGrantFilter({
  objectType,
  schemaName,
  search,
}: {
  objectType?: string | undefined;
  schemaName?: string | undefined;
  search: string;
}): string | undefined {
  return joinFilterConditions([
    schemaName === undefined
      ? undefined
      : `schema_name = ${quoteFilterValue(schemaName)}`,
    objectType ? `object_type = ${quoteFilterValue(objectType)}` : undefined,
    buildGrantSearchFilter(search),
  ]);
}

function roleTypeFilter(type: RoleFilterKind | undefined): string | undefined {
  switch (type) {
    case undefined:
      return;
    case "builtin":
      return "is_system_role = true";
    case "super":
      return "is_system_role = false AND attributes.is_superuser = true";
    case "repl":
      return "is_system_role = false AND attributes.is_superuser = false AND attributes.can_replicate = true AND attributes.can_login = true";
    case "group":
      return "is_system_role = false AND attributes.is_superuser = false AND attributes.can_login = false";
    case "login":
      return "is_system_role = false AND attributes.is_superuser = false AND attributes.can_login = true AND attributes.can_replicate = false";
    default:
      return type satisfies never;
  }
}

function buildRoleFilter({
  query,
  type,
}: {
  query: string;
  type?: RoleFilterKind | undefined;
}): string | undefined {
  return joinFilterConditions([
    buildContainsFilter("role_name", query),
    roleTypeFilter(type),
  ]);
}

export type { ContainsFilterField, RoleFilterKind };
export {
  buildContainsFilter,
  buildGrantFilter,
  buildOwnedFilter,
  buildRoleFilter,
  joinFilterConditions,
  MIN_SERVER_SUBSTRING_LENGTH,
  quoteFilterValue,
  SERVER_FILTER_DEBOUNCE_MS,
};
