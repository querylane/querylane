import type {
  VisualizationEdge,
  VisualizationNode,
} from "@/features/database-visualization/graph-model";

type AccessObjectType =
  | "database"
  | "foreign_table"
  | "function"
  | "large_object"
  | "large_objects"
  | "materialized_view"
  | "schema"
  | "sequence"
  | "table"
  | "tables"
  | "types"
  | "view";

interface AccessRoleNode {
  attributes: {
    bypassesRls: boolean;
    canLogin: boolean;
    isSuperuser: boolean;
  };
  roleId: string;
  roleName: string;
}

interface AccessRelatedRole {
  roleId: string;
  roleName: string;
}

interface AccessGrant {
  objectName: string;
  objectType: AccessObjectType;
  privilege: string;
  schemaName: string;
  withGrantOption: boolean;
}

interface AccessDefaultPrivilege {
  creatorRoleName: string;
  objectType: AccessObjectType;
  privilege: string;
  schemaName: string;
  withGrantOption: boolean;
}

interface AccessMapModelInput {
  databaseName: string;
  defaultPrivileges: AccessDefaultPrivilege[];
  directGrants: AccessGrant[];
  members: AccessRelatedRole[];
  ownedObjects: AccessGrant[];
  parentRoles: AccessRelatedRole[];
  publicGrants: AccessGrant[];
  role: AccessRoleNode;
}

interface AccessMapSummary {
  bypassesRls: boolean;
  defaultPrivilegeCount: number;
  directGrantCount: number;
  memberCount: number;
  ownedObjectCount: number;
  parentRoleCount: number;
  publicGrantCount: number;
  superuser: boolean;
}

interface AccessMapModel {
  edges: VisualizationEdge[];
  nodes: VisualizationNode[];
  summary: AccessMapSummary;
}

interface UpsertObjectNodeInput {
  badge: string;
  grant: AccessGrant;
  id: string;
  nodes: VisualizationNode[];
  seen: Set<string>;
}

interface AccessMapBuildContext {
  edges: VisualizationEdge[];
  input: AccessMapModelInput;
  nodes: VisualizationNode[];
  seenObjects: Set<string>;
  selectedRoleId: string;
}

function objectLabel(
  grant: Pick<AccessGrant, "objectName" | "objectType" | "schemaName">
) {
  if (grant.objectType === "database") {
    return grant.objectName || "database";
  }
  if (grant.objectType === "schema") {
    return grant.schemaName;
  }
  if (grant.schemaName && grant.objectName) {
    return `${grant.schemaName}.${grant.objectName}`;
  }
  return grant.objectName || grant.schemaName || grant.objectType;
}

function objectNodeId(
  prefix: string,
  grant: Pick<AccessGrant, "objectName" | "objectType" | "schemaName">
) {
  const target = objectLabel(grant);
  return `${prefix}:${grant.objectType}:${target}`;
}

function objectNavigation(
  grant: Pick<AccessGrant, "objectName" | "objectType" | "schemaName">
) {
  if (grant.objectType === "table" || grant.objectType === "foreign_table") {
    return {
      category: "tables" as const,
      name: grant.objectName,
      schema: grant.schemaName,
      to: "explorer" as const,
    };
  }
  if (grant.objectType === "view" || grant.objectType === "materialized_view") {
    return {
      category: "views" as const,
      name: grant.objectName,
      schema: grant.schemaName,
      to: "explorer" as const,
    };
  }
  return grant.schemaName
    ? { schema: grant.schemaName, to: "explorer" as const }
    : undefined;
}

function defaultPrivilegeScopeLine(privilege: AccessDefaultPrivilege): string {
  if (privilege.objectType === "large_objects") {
    return "Database scope";
  }
  return privilege.schemaName
    ? `Schema ${privilege.schemaName}`
    : "All schemas";
}

function roleBadges(role: AccessRoleNode): string[] {
  const badges: string[] = [];
  if (role.attributes.canLogin) {
    badges.push("LOGIN");
  }
  if (role.attributes.isSuperuser) {
    badges.push("SUPERUSER");
  }
  if (role.attributes.bypassesRls) {
    badges.push("BYPASS RLS");
  }
  return badges;
}

function upsertObjectNode({
  badge,
  grant,
  id,
  nodes,
  seen,
}: UpsertObjectNodeInput) {
  if (seen.has(id)) {
    return;
  }
  seen.add(id);
  nodes.push({
    data: {
      badges: [badge, grant.objectType.toUpperCase().replaceAll("_", " ")],
      lines: grant.withGrantOption ? ["With grant option"] : [],
      navigation: objectNavigation(grant),
      title: objectLabel(grant),
    },
    id,
    kind: "object",
  });
}

function appendParentRoleNodes(
  input: AccessMapModelInput,
  selectedRoleId: string,
  nodes: VisualizationNode[],
  edges: VisualizationEdge[]
) {
  for (const parent of input.parentRoles) {
    const id = `parent:${parent.roleId}`;
    nodes.push({
      data: {
        badges: ["PARENT"],
        lines: ["Privileges can inherit from this role"],
        navigation: { roleId: parent.roleId, to: "role" },
        title: parent.roleName,
      },
      id,
      kind: "role",
    });
    edges.push({
      id: `${selectedRoleId}->${id}`,
      label: "member of",
      source: selectedRoleId,
      target: id,
    });
  }
}

function appendMemberRoleNodes(
  input: AccessMapModelInput,
  selectedRoleId: string,
  nodes: VisualizationNode[],
  edges: VisualizationEdge[]
) {
  for (const member of input.members) {
    const id = `member:${member.roleId}`;
    nodes.push({
      data: {
        badges: ["MEMBER"],
        lines: ["This role inherits from the selected role"],
        navigation: { roleId: member.roleId, to: "role" },
        title: member.roleName,
      },
      id,
      kind: "role",
    });
    edges.push({
      id: `${id}->${selectedRoleId}`,
      label: "member of",
      source: id,
      target: selectedRoleId,
    });
  }
}

function appendDirectGrantNodes(context: AccessMapBuildContext) {
  for (const grant of context.input.directGrants) {
    const id = objectNodeId("object", grant);
    upsertObjectNode({
      badge: "GRANT",
      grant,
      id,
      nodes: context.nodes,
      seen: context.seenObjects,
    });
    context.edges.push({
      id: `${context.selectedRoleId}->${id}:${grant.privilege}`,
      label: grant.privilege,
      source: context.selectedRoleId,
      target: id,
    });
  }
}

function appendOwnedObjectNodes(context: AccessMapBuildContext) {
  for (const object of context.input.ownedObjects) {
    const id = objectNodeId("owned", object);
    upsertObjectNode({
      badge: "OWNER",
      grant: object,
      id,
      nodes: context.nodes,
      seen: context.seenObjects,
    });
    context.edges.push({
      id: `${context.selectedRoleId}->${id}:owns`,
      label: "owns",
      source: context.selectedRoleId,
      target: id,
    });
  }
}

function appendPublicGrantNodes(
  input: AccessMapModelInput,
  selectedRoleId: string,
  nodes: VisualizationNode[],
  edges: VisualizationEdge[]
) {
  const publicNodes = new Map<string, VisualizationNode>();
  for (const [index, grant] of input.publicGrants.entries()) {
    const id = objectNodeId("public", grant);
    let node = publicNodes.get(id);
    if (!node) {
      node = {
        data: {
          badges: [
            "PUBLIC",
            grant.objectType.toUpperCase().replaceAll("_", " "),
          ],
          lines: [],
          navigation: objectNavigation(grant),
          title: objectLabel(grant),
        },
        id,
        kind: "public",
      };
      publicNodes.set(id, node);
      nodes.push(node);
    }
    const privilegeLine = grant.withGrantOption
      ? `${grant.privilege} with grant option`
      : grant.privilege;
    if (!node.data.lines.includes(privilegeLine)) {
      node.data.lines.push(privilegeLine);
    }
    edges.push({
      id: `${id}->${selectedRoleId}:${grant.privilege}:${index}`,
      label: `PUBLIC ${grant.privilege}`,
      source: id,
      target: selectedRoleId,
    });
  }
}

function appendDefaultPrivilegeNodes(
  input: AccessMapModelInput,
  selectedRoleId: string,
  nodes: VisualizationNode[],
  edges: VisualizationEdge[]
) {
  const defaultNodes = new Map<string, VisualizationNode>();
  for (const privilege of input.defaultPrivileges) {
    const id = `defaults:${privilege.creatorRoleName}:${privilege.objectType}:${privilege.schemaName}:${privilege.privilege}`;
    let node = defaultNodes.get(id);
    if (!node) {
      node = {
        data: {
          badges: ["DEFAULT"],
          lines: [
            `${privilege.creatorRoleName} future ${privilege.objectType}`,
            defaultPrivilegeScopeLine(privilege),
          ],
          navigation: privilege.schemaName
            ? { schema: privilege.schemaName, to: "explorer" }
            : undefined,
          title: privilege.privilege,
        },
        id,
        kind: "default",
      };
      defaultNodes.set(id, node);
      nodes.push(node);
      edges.push({
        id: `${id}->${selectedRoleId}`,
        label: "future objects",
        source: id,
        target: selectedRoleId,
      });
    }

    const grantOptionLine = privilege.withGrantOption
      ? "With grant option"
      : "Without grant option";
    if (!node.data.lines.includes(grantOptionLine)) {
      node.data.lines.push(grantOptionLine);
    }
  }
}

function buildAccessSummary(input: AccessMapModelInput): AccessMapSummary {
  return {
    bypassesRls: input.role.attributes.bypassesRls,
    defaultPrivilegeCount: input.defaultPrivileges.length,
    directGrantCount: input.directGrants.length,
    memberCount: input.members.length,
    ownedObjectCount: input.ownedObjects.length,
    parentRoleCount: input.parentRoles.length,
    publicGrantCount: input.publicGrants.length,
    superuser: input.role.attributes.isSuperuser,
  };
}

function buildAccessMapModel(input: AccessMapModelInput): AccessMapModel {
  const selectedRoleId = `role:${input.role.roleId}`;
  const nodes: VisualizationNode[] = [
    {
      data: {
        badges: roleBadges(input.role),
        lines: [`Database ${input.databaseName}`],
        navigation: { roleId: input.role.roleId, to: "role" },
        title: input.role.roleName,
      },
      id: selectedRoleId,
      kind: "role",
    },
  ];
  const edges: VisualizationEdge[] = [];
  const seenObjects = new Set<string>();

  appendParentRoleNodes(input, selectedRoleId, nodes, edges);
  appendMemberRoleNodes(input, selectedRoleId, nodes, edges);
  const context = { edges, input, nodes, seenObjects, selectedRoleId };
  appendDirectGrantNodes(context);
  appendOwnedObjectNodes(context);
  appendPublicGrantNodes(input, selectedRoleId, nodes, edges);
  appendDefaultPrivilegeNodes(input, selectedRoleId, nodes, edges);

  return { edges, nodes, summary: buildAccessSummary(input) };
}

export type {
  AccessDefaultPrivilege,
  AccessGrant,
  AccessMapModel,
  AccessMapModelInput,
  AccessMapSummary,
  AccessObjectType,
  AccessRelatedRole,
  AccessRoleNode,
};
export { buildAccessMapModel };
