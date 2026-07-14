"use client";

import { timestampDate } from "@bufbuild/protobuf/wkt";
import {
  Clock,
  Copy,
  Crown,
  Database,
  Globe,
  Hash,
  KeyRound,
  LogIn,
  Network,
  ShieldAlert,
  ShieldCheck,
  ShieldOff,
  UserPlus,
} from "lucide-react";
import type { ComponentType } from "react";
import type {
  GrantsView,
  RoleTab,
} from "@/components/console-pages/role-detail-search";
import type {
  FacetState,
  FacetStates,
  GrantedObject,
} from "@/components/console-pages/role-grants-shared";
import { parseResourceLeafId } from "@/lib/console-resources";
import {
  type deriveRoleKind,
  isPredefinedRoleName,
  type MembershipOptionBadge,
  type PredefinedRoleInfo,
  type passwordExpiryStatus,
  predefinedRoleInfo,
} from "@/lib/role-display";
import type {
  ObjectGrant,
  OwnedObject,
  Role,
  RoleAttributes,
  RoleDefaultPrivilege,
} from "@/protogen/querylane/console/v1alpha1/role_pb";

type Section = RoleTab;

interface RoleDetailViewProps {
  accessRows: AccessSourceRow[];
  attributes: RoleAttributes | undefined;
  belongsTo: RelatedRole[];
  builtinInfo: PredefinedRoleInfo | null;
  builtinParentDetails: BuiltinParent[];
  comment: string;
  connLimitSub: string | undefined;
  databases: { id: string; name: string }[];
  defaultPrivileges: RoleDefaultPrivilege[];
  directGrantsSub: string | undefined;
  effectiveDb: { id: string; name: string } | null;
  effectiveDbId: string | null;
  expiry: ReturnType<typeof passwordExpiryStatus>;
  facetStates: FacetStates;
  grantObjects: GrantedObject[];
  grantsError: unknown;
  grantsPending: boolean;
  grantsReady: boolean;
  grantsView: GrantsView;
  instanceId: string;
  isSystem: boolean;
  kind: ReturnType<typeof deriveRoleKind>;
  memberRows: RelatedRole[];
  onNavigateGrants: (next: GrantsView) => void;
  onSelectGrantsDatabase: (next: string) => void;
  ownedObjects: OwnedObject[];
  ownedReady: boolean;
  ownedSub: string | undefined;
  publicGrants: ObjectGrant[];
  rlsNote: string | null;
  role: Role;
  section: Section;
  setChosenDbId: (next: string) => void;
  setSection: (next: Section) => void;
  sql: string;
}

function isSection(value: string): value is Section {
  switch (value) {
    case "definition":
    case "grants":
    case "members":
    case "overview":
    case "access-map":
      return true;
    default:
      return false;
  }
}

// Map a facet query's flags to a FacetState. A disabled query (enabled=false, as
// for system roles) is "ready" — its empty result is the answer, not a pending
// fetch; only an enabled query can be loading or errored.
function facetStateOf(
  enabled: boolean,
  query: { error: unknown; isPending: boolean },
  options?: { deferred?: boolean }
): FacetState {
  if (!enabled) {
    return "ready";
  }
  if (options?.deferred) {
    return "idle";
  }
  if (query.error) {
    return "error";
  }
  if (query.isPending) {
    return "loading";
  }
  return "ready";
}

function shouldLoadRoleFacets(section: Section): boolean {
  return section === "grants" || section === "access-map";
}

interface RelatedRole {
  grantor?: string | undefined;
  options: MembershipOptionBadge[];
  roleId: string;
  roleName: string;
}

interface AccessSourceRow {
  active: boolean;
  detail: string;
  icon: ComponentType<{ className?: string }>;
  jump?: { label: string; section: Section } | undefined;
  label: string;
  scope: "cluster" | "database";
  status: string;
  tone: "danger" | "active";
}

interface BuiltinParent {
  roleId: string;
  roleName: string;
  summary: string | null;
}

interface Capability {
  danger?: boolean;
  description: string;
  icon: ComponentType<{ className?: string }>;
  keyword: string;
  on: boolean;
  // When set, this value is rendered instead of the on/off marker — used for
  // the non-boolean CONNECTION LIMIT and VALID UNTIL attributes.
  value?: string;
}

const GRANTS_JUMP = { label: "Grants", section: "grants" } as const;

function facetAccessActive(state: FacetState, count: number): boolean {
  return state === "ready" && count > 0;
}

function facetAccessJump(state: FacetState, count: number) {
  return state === "idle" || count > 0 ? GRANTS_JUMP : undefined;
}

function facetAccessStatus(state: FacetState, count: number): string {
  if (state === "idle") {
    return "Load";
  }
  return String(count);
}

function ownedAccessDetail(state: FacetState, count: number): string {
  if (state === "idle") {
    return "Open Grants to load owned objects.";
  }
  if (count > 0) {
    return "Implicit full privileges on the objects it owns.";
  }
  return "Owns no objects here.";
}

function publicAccessDetail(state: FacetState): string {
  if (state === "idle") {
    return "Open Grants to load PUBLIC grants.";
  }
  return "Everyone — including this role — holds these.";
}

function directAccessDetail({
  deferred,
  effectiveDb,
}: {
  deferred: boolean;
  effectiveDb: { id: string; name: string } | null;
}): string {
  if (deferred) {
    return "Open Grants to load direct grants.";
  }
  if (effectiveDb) {
    return "Explicit object privileges granted to this role.";
  }
  return "No database selected.";
}

function directAccessStatus({
  count,
  deferred,
  ready,
}: {
  count: number;
  deferred: boolean;
  ready: boolean;
}): string {
  if (deferred) {
    return "Load";
  }
  if (ready) {
    return String(count);
  }
  return "—";
}

function capabilities(attributes: RoleAttributes | undefined): Capability[] {
  const connLimit = attributes?.connectionLimit ?? -1;
  const validUntil = attributes?.validUntil;
  return [
    {
      description: "Can connect to the database.",
      icon: LogIn,
      keyword: "LOGIN",
      on: Boolean(attributes?.canLogin),
    },
    {
      danger: true,
      description: "Bypasses every permission check.",
      icon: ShieldAlert,
      keyword: "SUPERUSER",
      on: Boolean(attributes?.isSuperuser),
    },
    {
      description: "Can create new databases.",
      icon: Database,
      keyword: "CREATEDB",
      on: Boolean(attributes?.canCreateDatabase),
    },
    {
      description: "Can create, drop, and grant non-superuser roles.",
      icon: UserPlus,
      keyword: "CREATEROLE",
      on: Boolean(attributes?.canCreateRole),
    },
    {
      danger: true,
      description: "Can initiate replication and use streaming.",
      icon: Copy,
      keyword: "REPLICATION",
      on: Boolean(attributes?.canReplicate),
    },
    {
      danger: true,
      description: "Skips Row-Level Security policies.",
      icon: ShieldOff,
      keyword: "BYPASSRLS",
      on: Boolean(attributes?.bypassesRls),
    },
    {
      description: "Inherits privileges of roles it's a member of.",
      icon: Network,
      keyword: "INHERIT",
      on: attributes?.inheritsByDefault !== false,
    },
    {
      description: connLimitDescription(connLimit),
      icon: Hash,
      keyword: "CONNECTION LIMIT",
      on: connLimit >= 0,
      value: connLimit < 0 ? "Unlimited" : String(connLimit),
    },
    {
      danger: Boolean(validUntil),
      description: validUntil
        ? "Login is rejected after this date."
        : "Password never expires.",
      icon: Clock,
      keyword: "VALID UNTIL",
      on: Boolean(validUntil),
      value: validUntil
        ? timestampDate(validUntil).toLocaleDateString()
        : "Never",
    },
  ];
}

function connLimitDescription(connLimit: number): string {
  if (connLimit < 0) {
    return "No limit on concurrent connections.";
  }
  if (connLimit === 0) {
    return "No connections allowed.";
  }
  return `Up to ${connLimit} concurrent connections.`;
}

function connLimitDisplay(connLimit: number): string {
  if (connLimit < 0) {
    return "Unlimited";
  }
  if (connLimit === 0) {
    return "No connections";
  }
  return `Limit ${connLimit}`;
}

function builtinDetailText(
  builtinInfo: PredefinedRoleInfo | null,
  builtinParents: string[]
): string {
  if (builtinInfo) {
    return builtinInfo.summary;
  }
  if (builtinParents.length > 0) {
    return `Member of ${builtinParents.join(", ")} — inherits its implicit privileges.`;
  }
  return "Not a built-in role and not a member of one.";
}

function directGrantsSubText({
  deferred,
  effectiveDbId,
  error,
  grantSchemaCount,
  grantsReady,
}: {
  deferred?: boolean | undefined;
  effectiveDbId: string | null;
  error: unknown;
  grantSchemaCount: number;
  grantsReady: boolean;
}): string | undefined {
  if (effectiveDbId === null) {
    return "No databases";
  }
  if (error) {
    return "Unavailable";
  }
  if (deferred) {
    return "Open Grants to load direct grants";
  }
  return grantsReady
    ? `objects across ${grantSchemaCount} schema${grantSchemaCount === 1 ? "" : "s"}`
    : undefined;
}

// KPI sub-label for the Owns tile, mirroring directGrantsSubText's states.
function ownedSubText({
  databaseName,
  deferred,
  effectiveDbId,
  error,
  ownedCount,
  ownedReady,
}: {
  databaseName: string | undefined;
  deferred?: boolean | undefined;
  effectiveDbId: string | null;
  error: unknown;
  ownedCount: number;
  ownedReady: boolean;
}): string | undefined {
  if (effectiveDbId === null) {
    return "No databases";
  }
  if (error) {
    return "Unavailable";
  }
  if (deferred) {
    return "Open Grants to load ownership";
  }
  const ownedSummary =
    ownedCount > 0
      ? `object${ownedCount === 1 ? "" : "s"} in ${databaseName ?? "db"}`
      : "no owned objects";
  return ownedReady ? ownedSummary : undefined;
}

// The RLS caveat shown under the access summary: superuser/BYPASSRLS overrides
// it entirely, otherwise table access gets a "RLS may still apply" note.
function rlsNoteText({
  bypassesRls,
  isSuperuser,
  tableAccessActive,
}: {
  bypassesRls: boolean;
  isSuperuser: boolean;
  tableAccessActive: boolean;
}): string | null {
  if (isSuperuser || bypassesRls) {
    return "Row-level security is bypassed entirely by this role.";
  }
  if (tableAccessActive) {
    return "Row-level security may still restrict which rows are visible — table access alone doesn't override RLS policies.";
  }
  return null;
}

// Direct pg_* parents of a role (no recursive closure): both the bare names and
// their doc summaries, in one pass over memberOf.
function deriveBuiltinParents(role: Role): {
  details: BuiltinParent[];
  names: string[];
} {
  const names: string[] = [];
  const details: BuiltinParent[] = [];
  for (const membership of role.memberOf) {
    if (isPredefinedRoleName(membership.roleName)) {
      names.push(membership.roleName);
      details.push({
        roleId: parseResourceLeafId(membership.role),
        roleName: membership.roleName,
        summary: predefinedRoleInfo(membership.roleName)?.summary ?? null,
      });
    }
  }
  return { details, names };
}

// The access-sources spine for ordinary roles: one row per path by which the
// role can reach objects (active or not), each with a jump to its detail.
function buildAccessRows({
  belongsTo,
  builtinActive,
  builtinDetail,
  builtinInfo,
  builtinParents,
  effectiveDb,
  grantObjects,
  grantsDeferred = false,
  grantsReady,
  isSuperuser,
  ownedCount,
  ownedState = "ready",
  publicCount,
  publicGrantsState = "ready",
}: {
  belongsTo: RelatedRole[];
  builtinActive: boolean;
  builtinDetail: string;
  builtinInfo: PredefinedRoleInfo | null;
  builtinParents: string[];
  effectiveDb: { id: string; name: string } | null;
  grantObjects: GrantedObject[];
  grantsDeferred?: boolean | undefined;
  grantsReady: boolean;
  isSuperuser: boolean;
  ownedCount: number;
  ownedState?: FacetState | undefined;
  publicCount: number;
  publicGrantsState?: FacetState | undefined;
}): AccessSourceRow[] {
  return [
    {
      active: isSuperuser,
      detail: isSuperuser
        ? "Bypasses every permission check — full access to everything."
        : "Not a superuser.",
      icon: ShieldAlert,
      label: "Superuser bypass",
      scope: "cluster",
      status: isSuperuser ? "Active" : "—",
      tone: "danger",
    },
    {
      active: builtinActive,
      detail: builtinDetail,
      icon: ShieldCheck,
      // Self-built-in is explained by the Capabilities card; via-membership jumps
      // to the Membership tab where the parent role is listed.
      jump:
        builtinInfo === null && builtinParents.length > 0
          ? { label: "Membership", section: "members" }
          : undefined,
      label: "Built-in role powers",
      scope: "cluster",
      status: builtinActive ? "Active" : "—",
      tone: "danger",
    },
    {
      active: belongsTo.length > 0,
      detail:
        belongsTo.length > 0
          ? "Inherits the access of its parent roles."
          : "Not a member of any other role.",
      icon: Network,
      jump:
        belongsTo.length > 0
          ? { label: "Membership", section: "members" }
          : undefined,
      label: "Inherited (membership)",
      scope: "cluster",
      status: String(belongsTo.length),
      tone: "active",
    },
    {
      active: facetAccessActive(ownedState, ownedCount),
      detail: ownedAccessDetail(ownedState, ownedCount),
      icon: Crown,
      jump: facetAccessJump(ownedState, ownedCount),
      label: "Owns objects",
      scope: "database",
      status: facetAccessStatus(ownedState, ownedCount),
      tone: "active",
    },
    {
      active: grantObjects.length > 0,
      detail: directAccessDetail({
        deferred: grantsDeferred,
        effectiveDb,
      }),
      icon: KeyRound,
      jump: { label: "Grants", section: "grants" },
      label: "Direct grants",
      scope: "database",
      status: directAccessStatus({
        count: grantObjects.length,
        deferred: grantsDeferred,
        ready: grantsReady,
      }),
      tone: "active",
    },
    {
      active: facetAccessActive(publicGrantsState, publicCount),
      detail: publicAccessDetail(publicGrantsState),
      icon: Globe,
      jump: facetAccessJump(publicGrantsState, publicCount),
      label: "PUBLIC (everyone)",
      scope: "database",
      status: facetAccessStatus(publicGrantsState, publicCount),
      tone: "active",
    },
  ];
}

// Hero block: avatar, name, kind/owner/expiry badges, and the built-in summary

export type {
  AccessSourceRow,
  BuiltinParent,
  Capability,
  RelatedRole,
  RoleDetailViewProps,
  Section,
};
export {
  buildAccessRows,
  builtinDetailText,
  capabilities,
  connLimitDisplay,
  deriveBuiltinParents,
  directGrantsSubText,
  facetStateOf,
  isSection,
  ownedSubText,
  rlsNoteText,
  shouldLoadRoleFacets,
};
