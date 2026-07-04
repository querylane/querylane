import { create, type MessageInitShape } from "@bufbuild/protobuf";
import { createClient, type Transport } from "@connectrpc/connect";
import { useTransport } from "@connectrpc/connect-query";
import { queryOptions, useQuery } from "@tanstack/react-query";
import {
  buildDatabaseName,
  buildInstanceName,
  buildRoleName,
} from "@/lib/console-resources";
import { paginateAll } from "@/lib/paginate-all";
import { RESOURCE_QUERY_OPTIONS } from "@/lib/query-policy";
import {
  ListPublicGrantsResponseSchema,
  ListRoleDefaultPrivilegesResponseSchema,
  ListRoleGrantsResponseSchema,
  ListRoleOwnedObjectsResponseSchema,
  ListRolesResponseSchema,
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

export { rolesForInstanceQueryInput, useListAllRolesQuery };
