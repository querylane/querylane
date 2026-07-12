import { create, type MessageInitShape } from "@bufbuild/protobuf";
import { createClient, type Transport } from "@connectrpc/connect";
import { useTransport } from "@connectrpc/connect-query";
import { queryOptions, useQuery } from "@tanstack/react-query";
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
  ListPublicGrantsResponseSchema,
  ListRoleDefaultPrivilegesResponseSchema,
  ListRoleGrantsResponseSchema,
  ListRoleOwnedObjectsResponseSchema,
  ListRolesResponseSchema,
  type ObjectGrant,
  type OwnedObject,
  type Role,
  type RoleDefaultPrivilege,
  RoleService,
} from "@/protogen/querylane/console/v1alpha1/role_pb";
import type {
  listPublicGrants,
  listRoleDefaultPrivileges,
  listRoleGrants,
  listRoleOwnedObjects,
  listRoles,
} from "@/protogen/querylane/console/v1alpha1/role-RoleService_connectquery";

// Non-exported types and fetch helpers come first; all exports follow (per the
// useExportsLast lint rule). Each fetch helper paginates the backend list RPC to
// completion via paginateAll — see role-lists fetch-all notes in query-policy.

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
  failedRequestCount: number;
  publicAccess: PublicAccessMapResource[];
  roleAccess: RoleAccessMapResource[];
}

interface PartialAccessResult<T> {
  failedRequestCount: number;
  value: T;
}

// A role/database pair starts three facet requests. Two pairs keep scheduling
// bounded while the transport's per-instance semaphore caps active RPCs at 4.
const ACCESS_MAP_RESOURCE_CONCURRENCY = 2;

async function mapInBatches<T, Result>(
  items: T[],
  mapItem: (item: T) => Promise<Result>
): Promise<Result[]> {
  const results: Result[] = [];
  for (
    let start = 0;
    start < items.length;
    start += ACCESS_MAP_RESOURCE_CONCURRENCY
  ) {
    const batch = items.slice(start, start + ACCESS_MAP_RESOURCE_CONCURRENCY);
    results.push(...(await Promise.all(batch.map(mapItem))));
  }
  return results;
}

async function keepPartialAccess<T>(
  request: Promise<T[]>
): Promise<PartialAccessResult<T[]>> {
  const [result] = await Promise.allSettled([request]);
  if (result.status === "fulfilled") {
    return { failedRequestCount: 0, value: result.value };
  }
  return { failedRequestCount: 1, value: [] };
}

function getListAllRolesQueryKey(
  input?: MessageInitShape<(typeof listRoles)["input"]>
) {
  return ["console", "roles", "list-all", input ?? null] as const;
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

function getListAllRoleGrantsQueryKey(input: ListRoleGrantsInput) {
  return ["console", "role-grants", "list-all", input] as const;
}

async function fetchAllRoleGrants(
  transport: Transport,
  input: ListRoleGrantsInput
) {
  const client = createClient(RoleService, transport);
  const grants = await paginateAll(
    (pageToken) =>
      client.listRoleGrants({ ...input, pageToken: pageToken ?? "" }),
    (response) => response.grants
  );

  return create(ListRoleGrantsResponseSchema, {
    grants,
    nextPageToken: "",
  });
}

async function fetchAllRoleOwnedObjects(
  transport: Transport,
  input: ListRoleOwnedObjectsInput
) {
  const client = createClient(RoleService, transport);
  const ownedObjects = await paginateAll(
    (pageToken) =>
      client.listRoleOwnedObjects({ ...input, pageToken: pageToken ?? "" }),
    (response) => response.ownedObjects
  );

  return create(ListRoleOwnedObjectsResponseSchema, {
    nextPageToken: "",
    ownedObjects,
  });
}

async function fetchAllRoleDefaultPrivileges(
  transport: Transport,
  input: ListRoleDefaultPrivilegesInput
) {
  const client = createClient(RoleService, transport);
  const defaultPrivileges = await paginateAll(
    (pageToken) =>
      client.listRoleDefaultPrivileges({
        ...input,
        pageToken: pageToken ?? "",
      }),
    (response) => response.defaultPrivileges
  );

  return create(ListRoleDefaultPrivilegesResponseSchema, {
    defaultPrivileges,
    nextPageToken: "",
  });
}

async function fetchAllPublicGrants(
  transport: Transport,
  input: ListPublicGrantsInput
) {
  const client = createClient(RoleService, transport);
  const grants = await paginateAll(
    (pageToken) =>
      client.listPublicGrants({ ...input, pageToken: pageToken ?? "" }),
    (response) => response.grants
  );

  return create(ListPublicGrantsResponseSchema, {
    grants,
    nextPageToken: "",
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

  const publicResults = await mapInBatches(mapDatabases, async (database) => {
    const databaseId = databaseIdOf(database);
    const grants = await keepPartialAccess(
      paginateAll(
        (pageToken) =>
          roleClient.listPublicGrants({
            orderBy: "schema_name asc, object_name asc, privilege asc",
            pageSize: 1000,
            pageToken: pageToken ?? "",
            parent: buildDatabaseName(input.instanceId, databaseId),
          }),
        (response) => response.grants
      )
    );
    return {
      failedRequestCount: grants.failedRequestCount,
      value: {
        databaseId,
        databaseName: databaseDisplayName(database),
        grants: grants.value,
      },
    };
  });
  const roleDatabasePairs = input.roles.flatMap((role) =>
    mapDatabases.map((database) => ({ database, role }))
  );
  const roleResults = await mapInBatches(
    roleDatabasePairs,
    async ({ database, role }) => {
      const roleId = roleResourceIdOf(role);
      const parent = buildRoleName(input.instanceId, roleId);
      const databaseId = databaseIdOf(database);
      const databaseName = databaseDisplayName(database);
      const databaseResource = buildDatabaseName(input.instanceId, databaseId);
      const [defaultPrivileges, grants, ownedObjects] = await Promise.all([
        keepPartialAccess(
          paginateAll(
            (pageToken) =>
              roleClient.listRoleDefaultPrivileges({
                database: databaseResource,
                orderBy:
                  "creator_role_name asc, schema_name asc, object_type asc, privilege asc",
                pageSize: 1000,
                pageToken: pageToken ?? "",
                parent,
              }),
            (response) => response.defaultPrivileges
          )
        ),
        keepPartialAccess(
          paginateAll(
            (pageToken) =>
              roleClient.listRoleGrants({
                database: databaseResource,
                orderBy: "schema_name asc, object_name asc, privilege asc",
                pageSize: 1000,
                pageToken: pageToken ?? "",
                parent,
              }),
            (response) => response.grants
          )
        ),
        keepPartialAccess(
          paginateAll(
            (pageToken) =>
              roleClient.listRoleOwnedObjects({
                database: databaseResource,
                orderBy: "schema_name asc, object_name asc",
                pageSize: 1000,
                pageToken: pageToken ?? "",
                parent,
              }),
            (response) => response.ownedObjects
          )
        ),
      ]);
      return {
        failedRequestCount:
          defaultPrivileges.failedRequestCount +
          grants.failedRequestCount +
          ownedObjects.failedRequestCount,
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
    failedRequestCount: [...publicResults, ...roleResults].reduce(
      (total, result) => total + result.failedRequestCount,
      0
    ),
    publicAccess: publicResults.map((result) => result.value),
    roleAccess: roleResults.map((result) => result.value),
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
    queryKey: getListAllRolesQueryKey(input),
    ...RESOURCE_QUERY_OPTIONS.roleList,
  });
}

function useListAllRolesQuery(
  input?: MessageInitShape<(typeof listRoles)["input"]>,
  options?: ListAllQueryOptions
) {
  const transport = useTransport();

  return useQuery({
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

  return useQuery({
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

export function useListAllRoleGrantsQuery(
  input: ListRoleGrantsInput,
  options?: ListAllQueryOptions
) {
  const transport = useTransport();

  return useQuery({
    enabled: options?.enabled ?? true,
    queryFn: () => fetchAllRoleGrants(transport, input),
    queryKey: getListAllRoleGrantsQueryKey(input),
    ...RESOURCE_QUERY_OPTIONS.roleGrants,
    ...(options?.refetchOnWindowFocus === undefined
      ? {}
      : { refetchOnWindowFocus: options.refetchOnWindowFocus }),
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

export function useListAllRoleOwnedObjectsQuery(
  input: ListRoleOwnedObjectsInput,
  options?: ListAllQueryOptions
) {
  const transport = useTransport();

  return useQuery({
    enabled: options?.enabled ?? true,
    queryFn: () => fetchAllRoleOwnedObjects(transport, input),
    queryKey: ["console", "role-owned-objects", "list-all", input] as const,
    ...RESOURCE_QUERY_OPTIONS.roleOwnedObjects,
    ...(options?.refetchOnWindowFocus === undefined
      ? {}
      : { refetchOnWindowFocus: options.refetchOnWindowFocus }),
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

export function useListAllRoleDefaultPrivilegesQuery(
  input: ListRoleDefaultPrivilegesInput,
  options?: ListAllQueryOptions
) {
  const transport = useTransport();

  return useQuery({
    enabled: options?.enabled ?? true,
    queryFn: () => fetchAllRoleDefaultPrivileges(transport, input),
    queryKey: [
      "console",
      "role-default-privileges",
      "list-all",
      input,
    ] as const,
    ...RESOURCE_QUERY_OPTIONS.roleDefaultPrivileges,
    ...(options?.refetchOnWindowFocus === undefined
      ? {}
      : { refetchOnWindowFocus: options.refetchOnWindowFocus }),
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

export function useListAllPublicGrantsQuery(
  input: ListPublicGrantsInput,
  options?: ListAllQueryOptions
) {
  const transport = useTransport();

  return useQuery({
    enabled: options?.enabled ?? true,
    queryFn: () => fetchAllPublicGrants(transport, input),
    queryKey: ["console", "public-grants", "list-all", input] as const,
    ...RESOURCE_QUERY_OPTIONS.publicGrants,
    ...(options?.refetchOnWindowFocus === undefined
      ? {}
      : { refetchOnWindowFocus: options.refetchOnWindowFocus }),
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
