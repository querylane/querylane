import { isNonEmptyString } from "@/lib/value-guards";

type ContainsFilterField =
  | "display_name"
  | "name"
  | "object_name"
  | "role_name"
  | "schema_name";

type RoleFilterKind = "builtin" | "group" | "login" | "repl" | "super";

const MIN_SERVER_SUBSTRING_LENGTH = 2;
const SERVER_FILTER_DEBOUNCE_MS = 200;

const quoteFilterValue: (value: string) => string = (value) =>
  `"${value.replaceAll("\\", "\\\\").replaceAll('"', '\\"')}"`;

const buildContainsFilter: (
  field: ContainsFilterField,
  value: string
) => string | undefined = (field, value) => {
  const trimmed = value.trim();
  if (trimmed.length < MIN_SERVER_SUBSTRING_LENGTH) {
    return undefined;
  }
  return `${field}:${quoteFilterValue(trimmed)}`;
};

const joinFilterConditions: (
  conditions: readonly (string | undefined)[]
) => string | undefined = (conditions) => {
  const present = conditions.filter((condition) => condition !== undefined);
  return present.length === 0 ? undefined : present.join(" AND ");
};

const buildOwnedFilter: ({
  objectType,
  search,
}: Readonly<{
  objectType?: string | undefined;
  search: string;
}>) => string | undefined = ({ objectType, search }) =>
  joinFilterConditions([
    isNonEmptyString(objectType)
      ? `object_type = ${quoteFilterValue(objectType)}`
      : undefined,
    buildGrantSearchFilter(search),
  ]);

function buildGrantSearchFilter(search: string) {
  const objectName = buildContainsFilter("object_name", search);
  if (!isNonEmptyString(objectName)) {
    return undefined;
  }
  const schemaName = buildContainsFilter("schema_name", search);
  if (!isNonEmptyString(schemaName)) {
    return undefined;
  }
  return `(${objectName} OR ${schemaName})`;
}

const buildGrantFilter: ({
  objectType,
  schemaName,
  search,
}: Readonly<{
  objectType?: string | undefined;
  schemaName?: string | undefined;
  search: string;
}>) => string | undefined = ({ objectType, schemaName, search }) =>
  joinFilterConditions([
    schemaName === undefined
      ? undefined
      : `schema_name = ${quoteFilterValue(schemaName)}`,
    isNonEmptyString(objectType)
      ? `object_type = ${quoteFilterValue(objectType)}`
      : undefined,
    buildGrantSearchFilter(search),
  ]);

function roleTypeFilter(type: RoleFilterKind | undefined) {
  switch (type) {
    case undefined:
      return undefined;
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

const buildRoleFilter: ({
  query,
  type,
}: Readonly<{
  query: string;
  type?: RoleFilterKind | undefined;
}>) => string | undefined = ({ query, type }) =>
  joinFilterConditions([
    buildContainsFilter("role_name", query),
    roleTypeFilter(type),
  ]);

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
