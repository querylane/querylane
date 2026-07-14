import type {
  PublicAccessMapResource,
  RoleAccessMapResource,
} from "@/hooks/api/role";
import { assertNever } from "@/lib/assert-never";
import { parseResourceLeafId } from "@/lib/console-resources";
import { deriveRoleKind, type RoleKind, roleIdOf } from "@/lib/role-display";
import type {
  ObjectGrant,
  Role,
  RoleDefaultPrivilege,
} from "@/protogen/querylane/console/v1alpha1/role_pb";
import { GrantObjectType } from "@/protogen/querylane/console/v1alpha1/role_pb";

type RoleMapVisibleKind = Exclude<"all" | RoleKind, "all">;
type RoleMapKindVisibility = Record<RoleMapVisibleKind, boolean>;
type RolesAccessMapEdgeTone =
  | "default"
  | "direct"
  | "member"
  | "owner"
  | "public";
type RolesAccessMapObjectKind =
  | "database"
  | "foreign table"
  | "function"
  | "large object"
  | "materialized view"
  | "schema"
  | "sequence"
  | "table"
  | "view";

interface RolesAccessMapRoleNode {
  id: string;
  kind: RoleKind | "public";
  roleId: string;
  subtitle: string;
  title: string;
}

interface RolesAccessMapObjectNode {
  databaseId: string;
  id: string;
  kind: RolesAccessMapObjectKind;
  subtitle: string;
  title: string;
}

interface RolesAccessMapEdge {
  id: string;
  privileges: string[];
  source: string;
  target: string;
  tone: RolesAccessMapEdgeTone;
}

interface RolesAccessMapModel {
  edges: RolesAccessMapEdge[];
  objects: RolesAccessMapObjectNode[];
  roles: RolesAccessMapRoleNode[];
}

interface BuildRolesAccessMapModelInput {
  publicAccess: PublicAccessMapResource[];
  roleAccess: RoleAccessMapResource[];
  roles: Role[];
  search?: string | undefined;
  visibleKinds: RoleMapKindVisibility;
}

const PUBLIC_ROLE_NODE: RolesAccessMapRoleNode = {
  id: "role:PUBLIC",
  kind: "public",
  roleId: "PUBLIC",
  subtitle: "pseudo-role",
  title: "PUBLIC",
};

function grantObjectKind(
  type: GrantObjectType
): RolesAccessMapObjectKind | null {
  switch (type) {
    case GrantObjectType.DATABASE:
      return "database";
    case GrantObjectType.SCHEMA:
      return "schema";
    case GrantObjectType.TABLE:
      return "table";
    case GrantObjectType.VIEW:
      return "view";
    case GrantObjectType.MATERIALIZED_VIEW:
      return "materialized view";
    case GrantObjectType.SEQUENCE:
      return "sequence";
    case GrantObjectType.FOREIGN_TABLE:
      return "foreign table";
    case GrantObjectType.FUNCTION:
      return "function";
    case GrantObjectType.LARGE_OBJECT:
      return "large object";
    case GrantObjectType.UNSPECIFIED:
      return null;
    default:
      return assertNever(type);
  }
}

function roleSubtitle(kind: RoleKind): string {
  switch (kind) {
    case "builtin":
      return "built-in";
    case "group":
      return "group";
    case "login":
      return "user";
    case "repl":
      return "replicator";
    case "super":
      return "superuser";
    default:
      return assertNever(kind);
  }
}

function normalizeSearch(search: string | undefined): string {
  return search?.trim().toLowerCase() ?? "";
}

function roleMatchesSearch(roleName: string, search: string): boolean {
  return search === "" || roleName.toLowerCase().includes(search);
}

function roleToNode(role: Role, kind: RoleKind): RolesAccessMapRoleNode {
  const roleId = roleIdOf(role);
  return {
    id: `role:${roleId}`,
    kind,
    roleId,
    subtitle: roleSubtitle(kind),
    title: role.roleName,
  };
}

function sortRoles(
  left: RolesAccessMapRoleNode,
  right: RolesAccessMapRoleNode
): number {
  const kindRank: Record<RolesAccessMapRoleNode["kind"], number> = {
    builtin: 5,
    group: 3,
    login: 1,
    public: 4,
    repl: 2,
    super: 0,
  };
  return kindRank[left.kind] - kindRank[right.kind];
}

function grantObjectTitle(input: {
  databaseName: string;
  objectName: string;
  objectType: GrantObjectType;
  schemaName: string;
}): string {
  if (input.objectType === GrantObjectType.DATABASE) {
    return input.objectName || input.databaseName;
  }
  if (input.objectType === GrantObjectType.SCHEMA) {
    return input.schemaName || input.objectName || input.databaseName;
  }
  return input.objectName || input.schemaName || input.databaseName;
}

function grantObjectKey(input: {
  databaseId: string;
  objectName: string;
  objectType: GrantObjectType;
  schemaName: string;
}): string | null {
  const kind = grantObjectKind(input.objectType);
  if (kind === null) {
    return null;
  }
  const objectLabel = grantObjectTitle({
    databaseName: input.databaseId,
    objectName: input.objectName,
    objectType: input.objectType,
    schemaName: input.schemaName,
  });
  const qualified =
    input.schemaName && input.objectType !== GrantObjectType.SCHEMA
      ? `${input.schemaName}.${objectLabel}`
      : objectLabel;
  return `object:${kind}:${input.databaseId}:${qualified}`;
}

function objectSubtitle(input: {
  databaseName: string;
  kind: RolesAccessMapObjectKind;
  schemaName: string;
}): string {
  if (input.kind === "database") {
    return "database";
  }
  if (input.kind === "schema") {
    return `schema · ${input.databaseName}`;
  }
  if (input.schemaName) {
    return `${input.kind} · ${input.schemaName}`;
  }
  return `${input.kind} · ${input.databaseName}`;
}

function addObjectNode(
  objectsById: Map<string, RolesAccessMapObjectNode>,
  input: {
    databaseId: string;
    databaseName: string;
    objectName: string;
    objectType: GrantObjectType;
    schemaName: string;
  }
): string | null {
  const kind = grantObjectKind(input.objectType);
  const id = grantObjectKey(input);
  if (kind === null || id === null) {
    return null;
  }
  if (!objectsById.has(id)) {
    objectsById.set(id, {
      databaseId: input.databaseId,
      id,
      kind,
      subtitle: objectSubtitle({
        databaseName: input.databaseName,
        kind,
        schemaName: input.schemaName,
      }),
      title: grantObjectTitle(input),
    });
  }
  return id;
}

function mergeEdge(input: {
  edgesById: Map<string, RolesAccessMapEdge>;
  privilege: string;
  source: string;
  target: string;
  tone: RolesAccessMapEdgeTone;
}) {
  const id = `${input.source}->${input.target}:${input.tone}`;
  const existing = input.edgesById.get(id);
  if (existing) {
    if (!existing.privileges.includes(input.privilege)) {
      existing.privileges.push(input.privilege);
    }
    return;
  }
  input.edgesById.set(id, {
    id,
    privileges: [input.privilege],
    source: input.source,
    target: input.target,
    tone: input.tone,
  });
}

function membershipTargetRoleId(role: Role["memberOf"][number]): string {
  return role.role ? parseResourceLeafId(role.role) : role.roleName;
}

function addMembershipEdgesForRole({
  edgesById,
  role,
  roleNodeIds,
}: {
  edgesById: Map<string, RolesAccessMapEdge>;
  role: Role;
  roleNodeIds: Set<string>;
}) {
  const source = `role:${roleIdOf(role)}`;
  if (!roleNodeIds.has(source)) {
    return;
  }
  for (const membership of role.memberOf) {
    const targetRoleId = membershipTargetRoleId(membership);
    if (!targetRoleId) {
      continue;
    }
    const target = `role:${targetRoleId}`;
    if (!roleNodeIds.has(target)) {
      continue;
    }
    mergeEdge({
      edgesById,
      privilege: "member of",
      source,
      target,
      tone: "member",
    });
  }
}

function addMembershipEdges({
  edgesById,
  roleNodeIds,
  roles,
}: {
  edgesById: Map<string, RolesAccessMapEdge>;
  roleNodeIds: Set<string>;
  roles: Role[];
}) {
  for (const role of roles) {
    addMembershipEdgesForRole({ edgesById, role, roleNodeIds });
  }
}

function buildVisibleRoleNodes({
  roles,
  search,
  visibleKinds,
}: {
  roles: Role[];
  search: string;
  visibleKinds: RoleMapKindVisibility;
}): RolesAccessMapRoleNode[] {
  const nodes: RolesAccessMapRoleNode[] = [];
  for (const role of roles) {
    const kind = deriveRoleKind(role);
    if (!(visibleKinds[kind] && roleMatchesSearch(role.roleName, search))) {
      continue;
    }
    nodes.push(roleToNode(role, kind));
  }
  nodes.sort(sortRoles);
  return nodes;
}

function roleNodeIdForAccess(access: RoleAccessMapResource): string {
  return `role:${access.roleId || access.roleName}`;
}

function addOwnedObjectEdges({
  access,
  edgesById,
  objectsById,
  roleNodeId,
}: {
  access: RoleAccessMapResource;
  edgesById: Map<string, RolesAccessMapEdge>;
  objectsById: Map<string, RolesAccessMapObjectNode>;
  roleNodeId: string;
}) {
  for (const object of access.ownedObjects) {
    const target = addObjectNode(objectsById, {
      databaseId: access.databaseId,
      databaseName: access.databaseName,
      objectName: object.objectName,
      objectType: object.objectType,
      schemaName: object.schemaName,
    });
    if (target) {
      mergeEdge({
        edgesById,
        privilege: "OWNER",
        source: roleNodeId,
        target,
        tone: "owner",
      });
    }
  }
}

function addGrantEdges({
  databaseId,
  databaseName,
  edgesById,
  grants,
  objectsById,
  source,
  tone,
}: {
  databaseId: string;
  databaseName: string;
  edgesById: Map<string, RolesAccessMapEdge>;
  grants: ObjectGrant[];
  objectsById: Map<string, RolesAccessMapObjectNode>;
  source: string;
  tone: RolesAccessMapEdgeTone;
}) {
  for (const grant of grants) {
    const target = addObjectNode(objectsById, {
      databaseId,
      databaseName,
      objectName: grant.objectName,
      objectType: grant.objectType,
      schemaName: grant.schemaName,
    });
    if (target) {
      mergeEdge({
        edgesById,
        privilege: grant.privilege,
        source,
        target,
        tone,
      });
    }
  }
}

function defaultPrivilegeLabel({
  defaultPrivilege,
  roleName,
}: {
  defaultPrivilege: RoleDefaultPrivilege;
  roleName: string;
}) {
  return `default privileges: ${defaultPrivilege.privilege} → ${roleName}`;
}

function defaultPrivilegeObjectTarget(input: {
  databaseId: string;
  databaseName: string;
  defaultPrivilege: RoleDefaultPrivilege;
  objectsById: Map<string, RolesAccessMapObjectNode>;
}) {
  if (input.defaultPrivilege.schemaName) {
    return addObjectNode(input.objectsById, {
      databaseId: input.databaseId,
      databaseName: input.databaseName,
      objectName: "",
      objectType: GrantObjectType.SCHEMA,
      schemaName: input.defaultPrivilege.schemaName,
    });
  }
  return addObjectNode(input.objectsById, {
    databaseId: input.databaseId,
    databaseName: input.databaseName,
    objectName: input.databaseName,
    objectType: GrantObjectType.DATABASE,
    schemaName: "",
  });
}

function addDefaultPrivilegeEdges({
  access,
  edgesById,
  objectsById,
  roleNodeIds,
}: {
  access: RoleAccessMapResource;
  edgesById: Map<string, RolesAccessMapEdge>;
  objectsById: Map<string, RolesAccessMapObjectNode>;
  roleNodeIds: Set<string>;
}) {
  for (const defaultPrivilege of access.defaultPrivileges ?? []) {
    const creatorRoleId =
      parseResourceLeafId(defaultPrivilege.creatorRole) ||
      defaultPrivilege.creatorRoleName;
    const source = `role:${creatorRoleId}`;
    if (!roleNodeIds.has(source)) {
      continue;
    }
    const target = defaultPrivilegeObjectTarget({
      databaseId: access.databaseId,
      databaseName: access.databaseName,
      defaultPrivilege,
      objectsById,
    });
    if (target) {
      mergeEdge({
        edgesById,
        privilege: defaultPrivilegeLabel({
          defaultPrivilege,
          roleName: access.roleName,
        }),
        source,
        target,
        tone: "default",
      });
    }
  }
}

function buildRolesAccessMapModel({
  publicAccess,
  roleAccess,
  roles,
  search,
  visibleKinds,
}: BuildRolesAccessMapModelInput): RolesAccessMapModel {
  const normalizedSearch = normalizeSearch(search);
  const visibleRoles = buildVisibleRoleNodes({
    roles,
    search: normalizedSearch,
    visibleKinds,
  });
  const roleNodeIds = new Set(visibleRoles.map((node) => node.id));
  const objectsById = new Map<string, RolesAccessMapObjectNode>();
  const edgesById = new Map<string, RolesAccessMapEdge>();
  const includePublicAccess = roleMatchesSearch("PUBLIC", normalizedSearch);

  addMembershipEdges({ edgesById, roleNodeIds, roles });

  for (const access of roleAccess) {
    const roleNodeId = roleNodeIdForAccess(access);
    if (!roleNodeIds.has(roleNodeId)) {
      continue;
    }
    addOwnedObjectEdges({ access, edgesById, objectsById, roleNodeId });
    addGrantEdges({
      databaseId: access.databaseId,
      databaseName: access.databaseName,
      edgesById,
      grants: access.grants,
      objectsById,
      source: roleNodeId,
      tone: "direct",
    });
    addDefaultPrivilegeEdges({ access, edgesById, objectsById, roleNodeIds });
  }

  if (includePublicAccess) {
    for (const access of publicAccess) {
      addGrantEdges({
        databaseId: access.databaseId,
        databaseName: access.databaseName,
        edgesById,
        grants: access.grants,
        objectsById,
        source: PUBLIC_ROLE_NODE.id,
        tone: "public",
      });
    }
  }

  const edges = [...edgesById.values()];
  const rolesWithPublic =
    includePublicAccess &&
    edges.some((edge) => edge.source === PUBLIC_ROLE_NODE.id)
      ? [...visibleRoles, PUBLIC_ROLE_NODE].toSorted(sortRoles)
      : visibleRoles;
  const objects = [...objectsById.values()];

  return {
    edges,
    objects,
    roles: rolesWithPublic,
  };
}

export type {
  RoleMapKindVisibility,
  RoleMapVisibleKind,
  RolesAccessMapEdge,
  RolesAccessMapEdgeTone,
  RolesAccessMapModel,
  RolesAccessMapObjectNode,
  RolesAccessMapRoleNode,
};
export { buildRolesAccessMapModel };
