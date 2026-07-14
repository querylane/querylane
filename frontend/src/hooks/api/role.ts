import { create, type MessageInitShape } from "@bufbuild/protobuf";
import { createClient, type Transport } from "@connectrpc/connect";
import {
  useQuery as useConnectQuery,
  useTransport,
} from "@connectrpc/connect-query";
import {
  queryOptions,
  useQuery as useTanstackQuery,
} from "@tanstack/react-query";
import { createConnectListAllQueryKey } from "@/lib/connect-query-key";
import {
  buildDatabaseName,
  buildInstanceName,
  buildRoleName,
  parseResourceLeafId,
} from "@/lib/console-resources";
import { paginateAll } from "@/lib/paginate-all";
import { RESOURCE_QUERY_OPTIONS } from "@/lib/query-policy";
import {
  type Database,
  DatabaseService,
} from "@/protogen/querylane/console/v1alpha1/database_pb";
import {
  ListRolesResponseSchema,
  type ObjectGrant,
  type OwnedObject,
  type Role,
  type RoleDefaultPrivilege,
  RoleService,
} from "@/protogen/querylane/console/v1alpha1/role_pb";
import {
  listPublicGrants,
  listRoleDefaultPrivileges,
  listRoleGrants,
  listRoleOwnedObjects,
  listRoles,
} from "@/protogen/querylane/console/v1alpha1/role-RoleService_connectquery";

// Non-exported types and fetch helpers come first; all exports follow (per the
// useExportsLast lint rule).

interface ListAllQueryOptions {
  enabled?: boolean;
  refetchOnWindowFocus?: boolean;
}

type ListRoleGrantsInput = MessageInitShape<(typeof listRoleGrants)["input"]>;

type ListRoleOwnedObjectsInput = MessageInitShape<
  (typeof listRoleOwnedObjects)["input"]
>;

type ListRoleDefaultPrivilegesInput = MessageInitShape<
  (typeof listRoleDefaultPrivileges)["input"]
>;

type ListPublicGrantsInput = MessageInitShape<
  (typeof listPublicGrants)["input"]
>;

interface RoleAccessMapResource {
  databaseId: string;
  databaseName: string;
  defaultPrivileges: RoleDefaultPrivilege[];
  grants: ObjectGrant[];
  ownedObjects: OwnedObject[];
  roleId: string;
  roleName: string;
}

interface PublicAccessMapResource {
  databaseId: string;
  databaseName: string;
  grants: ObjectGrant[];
}

interface RoleAccessMapResourcesResult {
  budgetSkippedRequestCount: number;
  failedRequestCount: number;
  publicAccess: PublicAccessMapResource[];
  roleAccess: RoleAccessMapResource[];
  truncatedRequestCount: number;
}

interface PartialAccessResult<T> {
  failedRequestCount: number;
  truncatedRequestCount: number;
  value: T;
}

interface RoleDatabasePair {
  database: Database;
  role: Role;
}

// A role/database pair starts three facet requests. Two pairs keep scheduling
// bounded while the transport's per-instance semaphore caps active RPCs at 4.
const ACCESS_MAP_RESOURCE_CONCURRENCY = 2;
const ACCESS_MAP_REQUEST_BUDGET = 300;
const ACCESS_MAP_ROLE_FACET_REQUEST_COUNT = 3;

async function mapWithConcurrency<T, Result>(
  items: T[],
  mapItem: (item: T) => Promise<Result>
): Promise<Result[]> {
  const results: Result[] = [];
  const entries = items.entries();

  async function worker(): Promise<void> {
    const entry = entries.next();
    if (entry.done) {
      return;
    }

    const [index, item] = entry.value;
    results[index] = await mapItem(item);
    await worker();
  }

  await Promise.all(
    Array.from(
      { length: Math.min(ACCESS_MAP_RESOURCE_CONCURRENCY, items.length) },
      worker
    )
  );
  return results;
}

function takeRoleDatabasePairs({
  databases,
  limit,
  roles,
}: {
  databases: Database[];
  limit: number;
  roles: Role[];
}): RoleDatabasePair[] {
  const pairs: RoleDatabasePair[] = [];
  for (const role of roles) {
    for (const database of databases) {
      if (pairs.length === limit) {
        return pairs;
      }
      pairs.push({ database, role });
    }
  }
  return pairs;
}

async function keepPartialAccess<Response extends { nextPageToken: string }, T>(
  request: Promise<Response>,
  selectItems: (response: Response) => T[]
): Promise<PartialAccessResult<T[]>> {
  const [result] = await Promise.allSettled([request]);
  if (result.status === "fulfilled") {
    return {
      failedRequestCount: 0,
      truncatedRequestCount: result.value.nextPageToken ? 1 : 0,
      value: selectItems(result.value),
    };
  }
  return { failedRequestCount: 1, truncatedRequestCount: 0, value: [] };
}

async function fetchAllRoles(
  transport: Transport,
  input?: MessageInitShape<(typeof listRoles)["input"]>
) {
  const client = createClient(RoleService, transport);
  const roles = await paginateAll(
    (pageToken) =>
      client.listRoles({
        ...(input ?? {}),
        pageToken: pageToken ?? "",
      }),
    (response) => response.roles
  );

  return create(ListRolesResponseSchema, {
    nextPageToken: "",
    roles,
  });
}

async function fetchRoleAccessMapResources(
  transport: Transport,
  input: { instanceId: string; roles: Role[] }
): Promise<RoleAccessMapResourcesResult> {
  const databaseClient = createClient(DatabaseService, transport);
  const roleClient = createClient(RoleService, transport);
  const databases = await paginateAll(
    (pageToken) =>
      databaseClient.listDatabases({
        orderBy: "name asc",
        pageSize: 1000,
        pageToken: pageToken ?? "",
        parent: buildInstanceName(input.instanceId),
      }),
    (response) => response.databases
  );
  const userDatabases = databases.filter(
    (database) => !database.isSystemDatabase
  );
  const mapDatabases = userDatabases.length > 0 ? userDatabases : databases;

  const scheduledPublicRequestCount = Math.min(
    ACCESS_MAP_REQUEST_BUDGET,
    mapDatabases.length
  );
  const publicResults = await mapWithConcurrency(
    mapDatabases.slice(0, scheduledPublicRequestCount),
    async (database) => {
      const databaseId = databaseIdOf(database);
      const grants = await keepPartialAccess(
        roleClient.listPublicGrants({
          orderBy: "schema_name asc, object_name asc, privilege asc",
          pageSize: 1000,
          pageToken: "",
          parent: buildDatabaseName(input.instanceId, databaseId),
        }),
        (response) => response.grants
      );
      return {
        failedRequestCount: grants.failedRequestCount,
        truncatedRequestCount: grants.truncatedRequestCount,
        value: {
          databaseId,
          databaseName: databaseDisplayName(database),
          grants: grants.value,
        },
      };
    }
  );
  const roleDatabasePairCount = input.roles.length * mapDatabases.length;
  const remainingRequestBudget =
    ACCESS_MAP_REQUEST_BUDGET - scheduledPublicRequestCount;
  const scheduledRolePairCount = Math.min(
    roleDatabasePairCount,
    Math.floor(remainingRequestBudget / ACCESS_MAP_ROLE_FACET_REQUEST_COUNT)
  );
  const roleResults = await mapWithConcurrency(
    takeRoleDatabasePairs({
      databases: mapDatabases,
      limit: scheduledRolePairCount,
      roles: input.roles,
    }),
    async ({ database, role }) => {
      const roleId = roleResourceIdOf(role);
      const parent = buildRoleName(input.instanceId, roleId);
      const databaseId = databaseIdOf(database);
      const databaseName = databaseDisplayName(database);
      const databaseResource = buildDatabaseName(input.instanceId, databaseId);
      const [defaultPrivileges, grants, ownedObjects] = await Promise.all([
        keepPartialAccess(
          roleClient.listRoleDefaultPrivileges({
            database: databaseResource,
            orderBy:
              "creator_role_name asc, schema_name asc, object_type asc, privilege asc",
            pageSize: 1000,
            pageToken: "",
            parent,
          }),
          (response) => response.defaultPrivileges
        ),
        keepPartialAccess(
          roleClient.listRoleGrants({
            database: databaseResource,
            orderBy: "schema_name asc, object_name asc, privilege asc",
            pageSize: 1000,
            pageToken: "",
            parent,
          }),
          (response) => response.grants
        ),
        keepPartialAccess(
          roleClient.listRoleOwnedObjects({
            database: databaseResource,
            orderBy: "schema_name asc, object_name asc",
            pageSize: 1000,
            pageToken: "",
            parent,
          }),
          (response) => response.ownedObjects
        ),
      ]);
      return {
        failedRequestCount:
          defaultPrivileges.failedRequestCount +
          grants.failedRequestCount +
          ownedObjects.failedRequestCount,
        truncatedRequestCount:
          defaultPrivileges.truncatedRequestCount +
          grants.truncatedRequestCount +
          ownedObjects.truncatedRequestCount,
        value: {
          databaseId,
          databaseName,
          defaultPrivileges: defaultPrivileges.value,
          grants: grants.value,
          ownedObjects: ownedObjects.value,
          roleId,
          roleName: role.roleName,
        },
      };
    }
  );
  return {
    budgetSkippedRequestCount:
      mapDatabases.length -
      scheduledPublicRequestCount +
      (roleDatabasePairCount - scheduledRolePairCount) *
        ACCESS_MAP_ROLE_FACET_REQUEST_COUNT,
    failedRequestCount: [...publicResults, ...roleResults].reduce(
      (total, result) => total + result.failedRequestCount,
      0
    ),
    publicAccess: publicResults.map((result) => result.value),
    roleAccess: roleResults.map((result) => result.value),
    truncatedRequestCount: [...publicResults, ...roleResults].reduce(
      (total, result) => total + result.truncatedRequestCount,
      0
    ),
  };
}

function databaseIdOf(database: Database): string {
  return (
    parseResourceLeafId(database.name) || database.displayName || database.name
  );
}

function databaseDisplayName(database: Database): string {
  return database.displayName || databaseIdOf(database);
}

function roleResourceIdOf(role: Role): string {
  return parseResourceLeafId(role.name) || role.roleName;
}

function rolesForInstanceQueryInput(instanceId: string) {
  return {
    orderBy: "name asc",
    pageSize: 1000,
    parent: buildInstanceName(instanceId),
  } as const satisfies MessageInitShape<(typeof listRoles)["input"]>;
}

function listAllRolesQueryOptions({
  input,
  transport,
}: {
  input?: MessageInitShape<(typeof listRoles)["input"]>;
  transport: Transport;
}) {
  return queryOptions({
    queryFn: () => fetchAllRoles(transport, input),
    queryKey: createConnectListAllQueryKey({
      input,
      method: listRoles,
      transport,
    }),
    ...RESOURCE_QUERY_OPTIONS.roleList,
  });
}

function useListAllRolesQuery(
  input?: MessageInitShape<(typeof listRoles)["input"]>,
  options?: ListAllQueryOptions
) {
  const transport = useTransport();

  return useTanstackQuery({
    ...listAllRolesQueryOptions({
      ...(input === undefined ? {} : { input }),
      transport,
    }),
    enabled: options?.enabled ?? true,
    ...(options?.refetchOnWindowFocus === undefined
      ? {}
      : { refetchOnWindowFocus: options.refetchOnWindowFocus }),
  });
}

function useRolesAccessMapResourcesQuery(
  input: { instanceId: string; roles: Role[] },
  options?: ListAllQueryOptions
) {
  const transport = useTransport();
  const roleKey = input.roles.map((role) => role.name).join("|");

  return useTanstackQuery({
    enabled: (options?.enabled ?? true) && input.roles.length > 0,
    queryFn: () => fetchRoleAccessMapResources(transport, input),
    queryKey: [
      "console",
      "roles-access-map-resources",
      input.instanceId,
      roleKey,
    ] as const,
    ...RESOURCE_QUERY_OPTIONS.roleGrants,
    ...(options?.refetchOnWindowFocus === undefined
      ? {}
      : { refetchOnWindowFocus: options.refetchOnWindowFocus }),
  });
}

export function roleGrantsForDatabaseQueryInput({
  databaseId,
  instanceId,
  roleId,
}: {
  databaseId: string;
  instanceId: string;
  roleId: string;
}) {
  return {
    database: buildDatabaseName(instanceId, databaseId),
    orderBy: "schema_name asc, object_name asc, privilege asc",
    pageSize: 1000,
    parent: buildRoleName(instanceId, roleId),
  } as const satisfies ListRoleGrantsInput;
}

export function useListRoleGrantsQuery(
  input: ListRoleGrantsInput,
  options?: ListAllQueryOptions
) {
  return useConnectQuery(listRoleGrants, input, {
    ...RESOURCE_QUERY_OPTIONS.roleGrants,
    ...options,
  });
}

export function roleOwnedObjectsForDatabaseQueryInput({
  databaseId,
  instanceId,
  roleId,
}: {
  databaseId: string;
  instanceId: string;
  roleId: string;
}) {
  return {
    database: buildDatabaseName(instanceId, databaseId),
    orderBy: "schema_name asc, object_name asc",
    pageSize: 1000,
    parent: buildRoleName(instanceId, roleId),
  } as const satisfies ListRoleOwnedObjectsInput;
}

export function useListRoleOwnedObjectsQuery(
  input: ListRoleOwnedObjectsInput,
  options?: ListAllQueryOptions
) {
  return useConnectQuery(listRoleOwnedObjects, input, {
    ...RESOURCE_QUERY_OPTIONS.roleOwnedObjects,
    ...options,
  });
}

export function roleDefaultPrivilegesForDatabaseQueryInput({
  databaseId,
  instanceId,
  roleId,
}: {
  databaseId: string;
  instanceId: string;
  roleId: string;
}) {
  return {
    database: buildDatabaseName(instanceId, databaseId),
    orderBy:
      "creator_role_name asc, schema_name asc, object_type asc, privilege asc",
    pageSize: 1000,
    parent: buildRoleName(instanceId, roleId),
  } as const satisfies ListRoleDefaultPrivilegesInput;
}

export function useListRoleDefaultPrivilegesQuery(
  input: ListRoleDefaultPrivilegesInput,
  options?: ListAllQueryOptions
) {
  return useConnectQuery(listRoleDefaultPrivileges, input, {
    ...RESOURCE_QUERY_OPTIONS.roleDefaultPrivileges,
    ...options,
  });
}

export function publicGrantsForDatabaseQueryInput({
  databaseId,
  instanceId,
}: {
  databaseId: string;
  instanceId: string;
}) {
  return {
    orderBy: "schema_name asc, object_name asc, privilege asc",
    pageSize: 1000,
    parent: buildDatabaseName(instanceId, databaseId),
  } as const satisfies ListPublicGrantsInput;
}

export function useListPublicGrantsQuery(
  input: ListPublicGrantsInput,
  options?: ListAllQueryOptions
) {
  return useConnectQuery(listPublicGrants, input, {
    ...RESOURCE_QUERY_OPTIONS.publicGrants,
    ...options,
  });
}

export type {
  PublicAccessMapResource,
  RoleAccessMapResource,
  RoleAccessMapResourcesResult,
};
export {
  rolesForInstanceQueryInput,
  useListAllRolesQuery,
  useRolesAccessMapResourcesQuery,
};
