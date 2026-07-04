import type { Timestamp } from "@bufbuild/protobuf/wkt";
import { timestampDate } from "@bufbuild/protobuf/wkt";
import { formatDistanceToNow } from "date-fns";
import { parseResourceLeafId } from "@/lib/console-resources";
import type { Role } from "@/protogen/querylane/console/v1alpha1/role_pb";

// Non-exported constants and helpers come first; all exports follow (per the
// useExportsLast lint rule).

const SOON_THRESHOLD_DAYS = 14;
const MS_PER_DAY = 86_400_000;

const SERVER_POWERS: AttributeBadge[] = [
  {
    key: "superuser",
    keyword: "SUPERUSER",
    label: "Superuser",
    tone: "warning",
    tooltip:
      "Has unrestricted access. Bypasses all permission checks and can do anything on this server.",
  },
  {
    key: "bypass-rls",
    keyword: "BYPASSRLS",
    label: "Bypasses RLS",
    tone: "warning",
    tooltip:
      "Ignores row-level security policies, so it can read and write rows that policies would normally hide.",
  },
  {
    key: "create-db",
    keyword: "CREATEDB",
    label: "Create databases",
    tone: "neutral",
    tooltip: "Can create new databases on this server.",
  },
  {
    key: "create-role",
    keyword: "CREATEROLE",
    label: "Create roles",
    tone: "neutral",
    tooltip: "Can create, alter, and drop other roles (users and groups).",
  },
  {
    key: "replication",
    keyword: "REPLICATION",
    label: "Replication",
    tone: "neutral",
    tooltip:
      "Can start streaming replication and manage backup mode. Used by replicas and backup tools.",
  },
];

function isServerPowerGranted(role: Role, key: string): boolean {
  const attributes = role.attributes;
  switch (key) {
    case "superuser":
      return Boolean(attributes?.isSuperuser);
    case "bypass-rls":
      return Boolean(attributes?.bypassesRls);
    case "create-db":
      return Boolean(attributes?.canCreateDatabase);
    case "create-role":
      return Boolean(attributes?.canCreateRole);
    case "replication":
      return Boolean(attributes?.canReplicate);
    default:
      return false;
  }
}

function plural(count: number): string {
  return count === 1 ? "" : "s";
}

function quoteIdentifier(name: string): string {
  return `"${name.replaceAll('"', '""')}"`;
}

function countRolesWhere(
  roles: Role[],
  predicate: (role: Role) => boolean
): number {
  return roles.filter(predicate).length;
}

// Counts login roles whose password has expired or is expiring soon, in a single
// pass (extracted so computeRoleRisk stays a flat tally).
function countPasswordExpiry(
  roles: Role[],
  now: Date
): { expired: number; soon: number } {
  let expired = 0;
  let soon = 0;
  for (const role of roles) {
    const attributes = role.attributes;
    if (!(attributes?.canLogin && attributes.validUntil)) {
      continue;
    }
    const state = passwordExpiryStatus(attributes.validUntil, now).state;
    if (state === "expired") {
      expired += 1;
    } else if (state === "soon") {
      soon += 1;
    }
  }
  return { expired, soon };
}

// Builds the WITH-option clause tokens for CREATE ROLE from the role attributes.
function roleAttributeOptions(attributes: Role["attributes"]): string[] {
  const options: string[] = [attributes?.canLogin ? "LOGIN" : "NOLOGIN"];
  const flags: [boolean, string][] = [
    [Boolean(attributes?.isSuperuser), "SUPERUSER"],
    [Boolean(attributes?.canCreateDatabase), "CREATEDB"],
    [Boolean(attributes?.canCreateRole), "CREATEROLE"],
    [Boolean(attributes?.canReplicate), "REPLICATION"],
    [Boolean(attributes?.bypassesRls), "BYPASSRLS"],
  ];
  for (const [enabled, keyword] of flags) {
    if (enabled) {
      options.push(keyword);
    }
  }
  options.push(attributes?.inheritsByDefault ? "INHERIT" : "NOINHERIT");
  if (attributes && attributes.connectionLimit >= 0) {
    options.push(`CONNECTION LIMIT ${attributes.connectionLimit}`);
  }
  if (attributes?.validUntil) {
    options.push(
      `VALID UNTIL '${timestampDate(attributes.validUntil).toISOString()}'`
    );
  }
  return options;
}

function membershipGrantStatements(
  memberships: Role["memberOf"],
  name: string
): string[] {
  return memberships.map((membership) => {
    const grantOptions: string[] = [];
    if (membership.adminOption) {
      grantOptions.push("ADMIN OPTION");
    }
    grantOptions.push(`INHERIT ${membership.inheritOption ? "TRUE" : "FALSE"}`);
    grantOptions.push(`SET ${membership.setOption ? "TRUE" : "FALSE"}`);
    return `GRANT ${quoteIdentifier(membership.roleName)} TO ${name} WITH ${grantOptions.join(", ")};`;
  });
}

function configParameterStatements(
  attributes: Role["attributes"],
  name: string
): string[] {
  const statements: string[] = [];
  for (const parameter of attributes?.configParameters ?? []) {
    const separator = parameter.indexOf("=");
    if (separator === -1) {
      continue;
    }
    const key = parameter.slice(0, separator);
    const value = parameter.slice(separator + 1);
    statements.push(
      `ALTER ROLE ${name} SET ${key} = '${value.replaceAll("'", "''")}';`
    );
  }
  return statements;
}

// Predefined PostgreSQL role descriptors (documentation, not catalog truth);
// see PredefinedRoleInfo below. Keyed by the lowercase pg_* role name.
const PREDEFINED_ROLES: Record<string, PredefinedRoleInfo> = {
  pg_checkpoint: {
    implicit: ["EXECUTE the CHECKPOINT command"],
    since: "PG 15",
    summary: "Run CHECKPOINT without being a superuser.",
  },
  pg_create_subscription: {
    implicit: ["CREATE SUBSCRIPTION (given CREATE on the database)"],
    since: "PG 16",
    summary: "Create logical-replication subscriptions.",
  },
  pg_database_owner: {
    implicit: [
      "Has no explicit members and no privileges by default",
      "Its sole implicit member is whoever owns the current database — privileges GRANTed to pg_database_owner flow to each database's owner, with no pg_auth_members row",
    ],
    since: "PG 14",
    summary: "Implicitly held by each database's owner.",
  },
  pg_execute_server_program: {
    implicit: ["COPY ... FROM/TO PROGRAM as the postgres OS user"],
    since: "PG 11",
    summary: "Execute server-side programs as the database OS user.",
  },
  pg_maintain: {
    implicit: [
      "VACUUM, ANALYZE, CLUSTER, REINDEX, REFRESH MATERIALIZED VIEW, and LOCK TABLE on all relations",
    ],
    since: "PG 17",
    summary: "Run VACUUM, ANALYZE, REINDEX, CLUSTER, REFRESH on any relation.",
  },
  pg_monitor: {
    implicit: [
      "Member of pg_read_all_settings, pg_read_all_stats, and pg_stat_scan_tables",
      "Read monitoring views and EXECUTE monitoring functions normally restricted to superusers",
    ],
    since: "PG 10",
    summary: "Read all monitoring views, settings, and statistics.",
  },
  pg_read_all_data: {
    implicit: [
      "SELECT on every table, view, and sequence",
      "USAGE on every schema",
      "Does NOT bypass row-level security — RLS policies still restrict rows",
    ],
    since: "PG 14",
    summary: "Read every table, view, and sequence in all databases.",
  },
  pg_read_all_settings: {
    implicit: [
      "Read every configuration variable, including superuser-restricted ones",
    ],
    since: "PG 10",
    summary: "Read all configuration settings, including superuser-only ones.",
  },
  pg_read_all_stats: {
    implicit: [
      "Read all pg_stat_* views and statistics-related functions",
      "See queries and activity of other roles",
    ],
    since: "PG 10",
    summary: "Read all pg_stat_* views and statistics functions.",
  },
  pg_read_server_files: {
    implicit: [
      "COPY and pg_read_file() from any path the postgres OS user can read",
    ],
    since: "PG 11",
    summary: "Read files from anywhere on the server filesystem.",
  },
  pg_signal_autovacuum_worker: {
    implicit: ["Cancel or terminate autovacuum worker backends"],
    since: "PG 18",
    summary: "Signal autovacuum worker processes.",
  },
  pg_signal_backend: {
    implicit: [
      "EXECUTE pg_cancel_backend() and pg_terminate_backend() against other non-superuser sessions",
      "Cannot signal superuser-owned backends",
    ],
    since: "PG 10",
    summary: "Cancel or terminate other non-superuser backends.",
  },
  pg_stat_scan_tables: {
    implicit: [
      "EXECUTE monitoring functions that may take ACCESS SHARE locks on tables",
    ],
    since: "PG 10",
    summary: "Run monitoring functions that may lock tables briefly.",
  },
  pg_use_reserved_connections: {
    implicit: ["Connect using slots set aside by reserved_connections"],
    since: "PG 16",
    summary: "Use reserved connection slots.",
  },
  pg_write_all_data: {
    implicit: [
      "INSERT, UPDATE, DELETE on every table",
      "USAGE on every schema",
      "Does NOT bypass row-level security — RLS policies still restrict rows",
    ],
    since: "PG 14",
    summary: "Write to every table in all databases (no SELECT implied).",
  },
  pg_write_server_files: {
    implicit: ["COPY ... TO any path the postgres OS user can write"],
    since: "PG 11",
    summary: "Write files to anywhere on the server filesystem.",
  },
};

function categorizeRole(role: Role): RoleCategory {
  if (role.isSystemRole) {
    return "system";
  }
  if (role.attributes?.canLogin) {
    return "login";
  }
  return "group";
}

export type RoleCategory = "login" | "group" | "system";
export type RoleKind = "super" | "repl" | "group" | "login" | "builtin";
export type RoleAttributeTone = "warning" | "neutral";

export const ROLE_KIND_LABEL: Record<RoleKind, string> = {
  builtin: "Built-in role",
  group: "Group",
  login: "User",
  repl: "Replicator",
  super: "Superuser",
};

export const ROLE_KIND_TOOLTIP: Record<RoleKind, string> = {
  builtin:
    "Predefined PostgreSQL role (pg_*) — ships in the cluster and grants implicit privileges to its members.",
  group:
    "Cannot log in — bundles privileges that member roles inherit (rolcanlogin = false).",
  login: "Can connect to the database (rolcanlogin).",
  repl: "Has REPLICATION — used for streaming or logical replication (rolreplication).",
  super: "Has SUPERUSER — bypasses every permission check (rolsuper).",
};

// Per-kind background/text tokens, shared by the role avatar and the kind badges.
export const ROLE_KIND_TONE: Record<RoleKind, string> = {
  builtin: "bg-sky-500/15 text-sky-700 dark:text-sky-400",
  group: "bg-muted text-muted-foreground",
  login: "bg-primary/10 text-primary",
  repl: "bg-violet-500/15 text-violet-700 dark:text-violet-400",
  super: "bg-amber-500/15 text-amber-700 dark:text-amber-400",
};

// Predefined PostgreSQL roles ship in pg_authid and grant implicit privileges
// to their members via hard-coded has_*_privilege() checks — there are no GRANT
// rows to inspect. The catalog does not expose what each grants, and the set
// changes across major versions, so this map is documentation, not ground
// truth: copy reads as guidance ("In recent PostgreSQL versions, …") and any
// pg_* role we don't recognize still gets a generic built-in label rather than
// a wrong claim. Names/privileges per the PostgreSQL predefined-roles docs.
export interface PredefinedRoleInfo {
  implicit: string[];
  since: string;
  summary: string;
}

// True for any pg_* role, whether or not we have a descriptor for it. Predefined
// PostgreSQL roles are always lowercase `pg_*`, so this is case-sensitive — a
// user role like `PG_APP` must not be classified as built-in.
export function isPredefinedRoleName(roleName: string): boolean {
  return roleName.startsWith("pg_");
}

// Descriptor for a known predefined role, or null. Unknown pg_* roles return
// null but are still rendered as built-in via deriveRoleKind / the generic
// label, never with a fabricated privilege claim.
export function predefinedRoleInfo(
  roleName: string
): PredefinedRoleInfo | null {
  return PREDEFINED_ROLES[roleName] ?? null;
}

export function deriveRoleKind(role: Role): RoleKind {
  if (role.isSystemRole || isPredefinedRoleName(role.roleName)) {
    return "builtin";
  }
  const attributes = role.attributes;
  if (attributes?.isSuperuser) {
    return "super";
  }
  if (attributes?.canReplicate && attributes.canLogin) {
    return "repl";
  }
  if (!attributes?.canLogin) {
    return "group";
  }
  return "login";
}

export interface AttributeBadge {
  key: string;
  keyword: string;
  label: string;
  tone: RoleAttributeTone;
  tooltip: string;
}

export interface CapabilityState extends AttributeBadge {
  granted: boolean;
}

export interface MembershipOptionBadge {
  key: string;
  label: string;
  tooltip: string;
}

export interface MemberEntry {
  adminOption: boolean;
  inheritOption: boolean;
  roleId: string;
  roleName: string;
  setOption: boolean;
}

export interface RoleRisk {
  bypassesRls: number;
  canCreateDatabase: number;
  canCreateRole: number;
  expiredPasswords: number;
  expiringSoon: number;
  severity: "default" | "destructive";
  superusers: number;
}

export type ExpiryState = "none" | "valid" | "soon" | "expired";

export interface PasswordExpiry {
  label: string;
  state: ExpiryState;
}

export function roleIdOf(role: Role): string {
  return parseResourceLeafId(role.name);
}

export function categorizeRoles(roles: Role[]): Record<RoleCategory, Role[]> {
  const grouped: Record<RoleCategory, Role[]> = {
    group: [],
    login: [],
    system: [],
  };
  for (const role of roles) {
    grouped[categorizeRole(role)].push(role);
  }
  return grouped;
}

export function roleCapabilityMatrix(role: Role): CapabilityState[] {
  return SERVER_POWERS.map((power) => ({
    ...power,
    granted: isServerPowerGranted(role, power.key),
  }));
}

export function roleRiskNotice(
  role: Role
): { description: string; title: string } | null {
  const attributes = role.attributes;
  if (attributes?.isSuperuser) {
    return {
      description:
        "This role is a superuser — it bypasses every permission check and can do anything on this server.",
      title: "Full administrative access",
    };
  }
  if (attributes?.bypassesRls) {
    return {
      description:
        "This role ignores row-level security policies, so it can read and write rows that policies would normally hide.",
      title: "Bypasses row-level security",
    };
  }
  return null;
}

export function membershipOptionBadges(membership: {
  adminOption: boolean;
  inheritOption: boolean;
  setOption: boolean;
}): MembershipOptionBadge[] {
  const badges: MembershipOptionBadge[] = [];
  if (membership.adminOption) {
    badges.push({
      key: "admin",
      label: "Can grant",
      tooltip: "Can grant this membership to other roles (WITH ADMIN OPTION).",
    });
  }
  if (membership.inheritOption) {
    badges.push({
      key: "inherit",
      label: "Inherits",
      tooltip:
        "Privileges from this membership are used automatically (WITH INHERIT).",
    });
  }
  if (membership.setOption) {
    badges.push({
      key: "set",
      label: "Can SET ROLE",
      tooltip: "Can switch into this role with SET ROLE (WITH SET).",
    });
  }
  return badges;
}

export function buildInverseMembershipIndex(
  roles: Role[]
): Map<string, MemberEntry[]> {
  const index = new Map<string, MemberEntry[]>();
  for (const child of roles) {
    for (const membership of child.memberOf) {
      const entry: MemberEntry = {
        adminOption: membership.adminOption,
        inheritOption: membership.inheritOption,
        roleId: roleIdOf(child),
        roleName: child.roleName,
        setOption: membership.setOption,
      };
      const existing = index.get(membership.roleName);
      if (existing) {
        existing.push(entry);
      } else {
        index.set(membership.roleName, [entry]);
      }
    }
  }
  return index;
}

export function passwordExpiryStatus(
  validUntil: Timestamp | undefined,
  now: Date = new Date()
): PasswordExpiry {
  if (!validUntil) {
    return { label: "No expiry", state: "none" };
  }
  const expiresAt = timestampDate(validUntil);
  const diffMs = expiresAt.getTime() - now.getTime();
  const relative = formatDistanceToNow(expiresAt, { addSuffix: true });
  if (diffMs <= 0) {
    return { label: `Expired ${relative}`, state: "expired" };
  }
  if (diffMs <= SOON_THRESHOLD_DAYS * MS_PER_DAY) {
    return { label: `Expires ${relative}`, state: "soon" };
  }
  return { label: `Expires ${relative}`, state: "valid" };
}

export function computeRoleRisk(
  roles: Role[],
  now: Date = new Date()
): RoleRisk {
  const { expired: expiredPasswords, soon: expiringSoon } = countPasswordExpiry(
    roles,
    now
  );
  const superusers = countRolesWhere(roles, (role) =>
    Boolean(role.attributes?.isSuperuser)
  );
  const bypassesRls = countRolesWhere(roles, (role) =>
    Boolean(role.attributes?.bypassesRls)
  );
  const severity =
    superusers > 1 || bypassesRls > 0 || expiredPasswords > 0
      ? "destructive"
      : "default";
  return {
    bypassesRls,
    canCreateDatabase: countRolesWhere(roles, (role) =>
      Boolean(role.attributes?.canCreateDatabase)
    ),
    canCreateRole: countRolesWhere(roles, (role) =>
      Boolean(role.attributes?.canCreateRole)
    ),
    expiredPasswords,
    expiringSoon,
    severity,
    superusers,
  };
}

export function describeRoleRisk(risk: RoleRisk): string[] {
  const clauses: string[] = [];
  if (risk.superusers > 0) {
    clauses.push(`${risk.superusers} superuser${plural(risk.superusers)}`);
  }
  if (risk.bypassesRls > 0) {
    clauses.push(
      `${risk.bypassesRls} role${plural(risk.bypassesRls)} that can bypass row-level security`
    );
  }
  if (risk.canCreateRole > 0) {
    clauses.push(
      `${risk.canCreateRole} role${plural(risk.canCreateRole)} that can create roles`
    );
  }
  if (risk.canCreateDatabase > 0) {
    clauses.push(
      `${risk.canCreateDatabase} role${plural(risk.canCreateDatabase)} that can create databases`
    );
  }
  if (risk.expiredPasswords > 0) {
    clauses.push(
      `${risk.expiredPasswords} expired password${plural(risk.expiredPasswords)}`
    );
  }
  if (risk.expiringSoon > 0) {
    clauses.push(
      `${risk.expiringSoon} password${plural(risk.expiringSoon)} expiring soon`
    );
  }
  return clauses;
}

export function expiryToneClass(state: ExpiryState): string {
  if (state === "expired") {
    return "text-destructive";
  }
  if (state === "soon") {
    return "text-amber-600 dark:text-amber-400";
  }
  return "";
}

export function formatConnectionLimit(limit: number): string {
  if (limit < 0) {
    return "Unlimited";
  }
  if (limit === 0) {
    return "No connections allowed (0)";
  }
  return `${limit} concurrent connection${plural(limit)}`;
}

export function buildRoleSql(role: Role): string {
  const name = quoteIdentifier(role.roleName);
  const options = roleAttributeOptions(role.attributes);
  return [
    `CREATE ROLE ${name} WITH ${options.join(" ")};`,
    ...membershipGrantStatements(role.memberOf, name),
    ...configParameterStatements(role.attributes, name),
  ].join("\n");
}
