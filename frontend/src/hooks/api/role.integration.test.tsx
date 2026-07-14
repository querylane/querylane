import { create } from "@bufbuild/protobuf";
import { createRouterTransport, type Transport } from "@connectrpc/connect";
import { TransportProvider } from "@connectrpc/connect-query";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { act, cleanup, renderHook, waitFor } from "@testing-library/react";
import type { ReactNode } from "react";
import { afterEach, describe, expect, test } from "vitest";
import {
  publicGrantsForDatabaseQueryInput,
  roleDefaultPrivilegesForDatabaseQueryInput,
  roleGrantsForDatabaseQueryInput,
  roleOwnedObjectsForDatabaseQueryInput,
  rolesForInstanceQueryInput,
  useListAllRolesQuery,
  useListPublicGrantsQuery,
  useListRoleDefaultPrivilegesQuery,
  useListRoleGrantsQuery,
  useListRoleOwnedObjectsQuery,
  useRolesAccessMapResourcesQuery,
} from "@/hooks/api/role";
import { createConnectListAllQueryKey } from "@/lib/connect-query-key";
import {
  DatabaseService,
  ListDatabasesResponseSchema,
} from "@/protogen/querylane/console/v1alpha1/database_pb";
import {
  GrantObjectType,
  type ListPublicGrantsRequest,
  ListPublicGrantsResponseSchema,
  type ListRoleDefaultPrivilegesRequest,
  ListRoleDefaultPrivilegesResponseSchema,
  type ListRoleGrantsRequest,
  ListRoleGrantsResponseSchema,
  type ListRoleOwnedObjectsRequest,
  ListRoleOwnedObjectsResponseSchema,
  type ListRolesRequest,
  ListRolesResponseSchema,
  RoleSchema,
  RoleService,
} from "@/protogen/querylane/console/v1alpha1/role_pb";
import { listRoles } from "@/protogen/querylane/console/v1alpha1/role-RoleService_connectquery";

const TEST_NUMBER_1000 = 1000;
const TEST_NUMBER_4 = 4;
const TEST_NUMBER_100 = 100;
const TEST_NUMBER_66 = 66;
const TEST_NUMBER_298 = 298;
const TEST_NUMBER_102 = 102;
const TEST_NUMBER_5 = 5;
const TEST_NUMBER_6 = 6;

const ROLE_ID = "YWxpY2U";
const DATABASE_SCOPE = {
  databaseId: "postgres",
  instanceId: "local",
  roleId: ROLE_ID,
} as const;

const activeQueryClients: QueryClient[] = [];

// An infinite gcTime stops TanStack Query from scheduling cache
// garbage-collection timers that would outlive the test; afterEach clears
// the cache instead.
const TEST_GC_TIME = Number.POSITIVE_INFINITY;

function createWrapper(
  transport: Transport,
  queryClient = new QueryClient({
    defaultOptions: {
      mutations: { gcTime: TEST_GC_TIME, retry: false },
      queries: { gcTime: TEST_GC_TIME, retry: false },
    },
  })
) {
  activeQueryClients.push(queryClient);

  return function Wrapper({ children }: { children: ReactNode }) {
    return (
      <TransportProvider transport={transport}>
        <QueryClientProvider client={queryClient}>
          {children}
        </QueryClientProvider>
      </TransportProvider>
    );
  };
}

async function flushMicrotasks(ticks = 10) {
  if (ticks <= 0) {
    return;
  }

  await act(async () => {
    await Promise.resolve();
  });
  await flushMicrotasks(ticks - 1);
}

afterEach(async () => {
  cleanup();
  // Drop cached queries so pending garbage-collection timers do not outlive
  // the test.
  await Promise.all(
    activeQueryClients.splice(0).map(async (queryClient) => {
      await queryClient.cancelQueries();
      queryClient.clear();
    })
  );
});

describe("aggregate role query keys", () => {
  test("derives the list-all roles cache from its Connect Query method", () => {
    const transport = createRouterTransport(() => undefined);
    const queryClient = new QueryClient({
      defaultOptions: {
        queries: { gcTime: TEST_GC_TIME, retry: false },
      },
    });
    const rolesInput = rolesForInstanceQueryInput("local");

    renderHook(
      () => {
        useListAllRolesQuery(rolesInput, { enabled: false });
      },
      { wrapper: createWrapper(transport, queryClient) }
    );

    expect(
      queryClient
        .getQueryCache()
        .getAll()
        .map((query) => query.queryKey)
    ).toEqual([
      createConnectListAllQueryKey({
        input: rolesInput,
        method: listRoles,
        transport,
      }),
    ]);
  });
});

describe("useListAllRolesQuery", () => {
  test("collects every page of roles into a single response", async () => {
    const requests: ListRolesRequest[] = [];
    const transport = createRouterTransport(({ service }) => {
      service(RoleService, {
        listRoles(request) {
          requests.push(request);
          if (request.pageToken === "") {
            return create(ListRolesResponseSchema, {
              nextPageToken: "page-2",
              roles: [
                { name: "instances/local/roles/YWxpY2U", roleName: "alice" },
              ],
            });
          }
          return create(ListRolesResponseSchema, {
            nextPageToken: "",
            roles: [{ name: "instances/local/roles/Ym9i", roleName: "bob" }],
          });
        },
      });
    });

    const { result } = renderHook(() => useListAllRolesQuery(), {
      wrapper: createWrapper(transport),
    });

    await waitFor(() => {
      expect(result.current.isSuccess).toBe(true);
    });
    expect(requests).toHaveLength(2);
    expect(requests[1]?.pageToken).toBe("page-2");
    expect(result.current.data?.roles.map((role) => role.roleName)).toEqual([
      "alice",
      "bob",
    ]);
    expect(result.current.data?.nextPageToken).toBe("");
  });

  test("forwards the instance-scoped input to the list roles call", async () => {
    const requests: ListRolesRequest[] = [];
    const transport = createRouterTransport(({ service }) => {
      service(RoleService, {
        listRoles(request) {
          requests.push(request);
          return create(ListRolesResponseSchema, {
            nextPageToken: "",
            roles: [],
          });
        },
      });
    });

    const { result } = renderHook(
      () =>
        useListAllRolesQuery(rolesForInstanceQueryInput("local"), {
          enabled: true,
          refetchOnWindowFocus: false,
        }),
      { wrapper: createWrapper(transport) }
    );

    await waitFor(() => {
      expect(result.current.isSuccess).toBe(true);
    });
    expect(requests).toHaveLength(1);
    expect(requests[0]?.parent).toBe("instances/local");
    expect(requests[0]?.orderBy).toBe("name asc");
    expect(requests[0]?.pageSize).toBe(TEST_NUMBER_1000);
  });

  test("skips fetching roles when disabled", async () => {
    const requests: ListRolesRequest[] = [];
    const transport = createRouterTransport(({ service }) => {
      service(RoleService, {
        listRoles(request) {
          requests.push(request);
          return create(ListRolesResponseSchema, {
            nextPageToken: "",
            roles: [],
          });
        },
      });
    });

    const { result } = renderHook(
      () =>
        useListAllRolesQuery(undefined, {
          enabled: false,
          refetchOnWindowFocus: false,
        }),
      { wrapper: createWrapper(transport) }
    );

    await flushMicrotasks();
    expect(result.current.fetchStatus).toBe("idle");
    expect(requests).toHaveLength(0);
  });
});

describe("useListRoleGrantsQuery", () => {
  test("keeps the first page and continuation token for role grants", async () => {
    const requests: ListRoleGrantsRequest[] = [];
    const transport = createRouterTransport(({ service }) => {
      service(RoleService, {
        listRoleGrants(request) {
          requests.push(request);
          return create(ListRoleGrantsResponseSchema, {
            grants: [{ objectName: "orders", privilege: "SELECT" }],
            nextPageToken: "page-2",
          });
        },
      });
    });

    const { result } = renderHook(
      () =>
        useListRoleGrantsQuery(roleGrantsForDatabaseQueryInput(DATABASE_SCOPE)),
      { wrapper: createWrapper(transport) }
    );

    await waitFor(() => {
      expect(result.current.isSuccess).toBe(true);
    });
    expect(requests).toHaveLength(1);
    expect(requests[0]?.parent).toBe(`instances/local/roles/${ROLE_ID}`);
    expect(requests[0]?.database).toBe("instances/local/databases/postgres");
    expect(requests[0]?.pageSize).toBe(TEST_NUMBER_1000);
    expect(requests[0]?.pageToken).toBe("");
    expect(result.current.data?.grants.map((grant) => grant.privilege)).toEqual(
      ["SELECT"]
    );
    expect(result.current.data?.nextPageToken).toBe("page-2");
  });

  test("skips fetching grants when disabled", async () => {
    const requests: ListRoleGrantsRequest[] = [];
    const transport = createRouterTransport(({ service }) => {
      service(RoleService, {
        listRoleGrants(request) {
          requests.push(request);
          return create(ListRoleGrantsResponseSchema, {
            grants: [],
            nextPageToken: "",
          });
        },
      });
    });

    const { result } = renderHook(
      () =>
        useListRoleGrantsQuery(
          roleGrantsForDatabaseQueryInput(DATABASE_SCOPE),
          { enabled: false, refetchOnWindowFocus: false }
        ),
      { wrapper: createWrapper(transport) }
    );

    await flushMicrotasks();
    expect(result.current.fetchStatus).toBe("idle");
    expect(requests).toHaveLength(0);
  });
});

describe("useListRoleOwnedObjectsQuery", () => {
  test("keeps the first page and continuation token for owned objects", async () => {
    const requests: ListRoleOwnedObjectsRequest[] = [];
    const transport = createRouterTransport(({ service }) => {
      service(RoleService, {
        listRoleOwnedObjects(request) {
          requests.push(request);
          return create(ListRoleOwnedObjectsResponseSchema, {
            nextPageToken: "page-2",
            ownedObjects: [{ objectName: "orders", schemaName: "public" }],
          });
        },
      });
    });

    const { result } = renderHook(
      () =>
        useListRoleOwnedObjectsQuery(
          roleOwnedObjectsForDatabaseQueryInput(DATABASE_SCOPE)
        ),
      { wrapper: createWrapper(transport) }
    );

    await waitFor(() => {
      expect(result.current.isSuccess).toBe(true);
    });
    expect(requests).toHaveLength(1);
    expect(requests[0]?.parent).toBe(`instances/local/roles/${ROLE_ID}`);
    expect(requests[0]?.pageSize).toBe(TEST_NUMBER_1000);
    expect(requests[0]?.pageToken).toBe("");
    expect(
      result.current.data?.ownedObjects.map((owned) => owned.objectName)
    ).toEqual(["orders"]);
    expect(result.current.data?.nextPageToken).toBe("page-2");
  });

  test("skips fetching owned objects when disabled", async () => {
    const requests: ListRoleOwnedObjectsRequest[] = [];
    const transport = createRouterTransport(({ service }) => {
      service(RoleService, {
        listRoleOwnedObjects(request) {
          requests.push(request);
          return create(ListRoleOwnedObjectsResponseSchema, {
            nextPageToken: "",
            ownedObjects: [],
          });
        },
      });
    });

    const { result } = renderHook(
      () =>
        useListRoleOwnedObjectsQuery(
          roleOwnedObjectsForDatabaseQueryInput(DATABASE_SCOPE),
          { enabled: false, refetchOnWindowFocus: false }
        ),
      { wrapper: createWrapper(transport) }
    );

    await flushMicrotasks();
    expect(result.current.fetchStatus).toBe("idle");
    expect(requests).toHaveLength(0);
  });
});

describe("useListRoleDefaultPrivilegesQuery", () => {
  test("keeps the first page and continuation token for default privileges", async () => {
    const requests: ListRoleDefaultPrivilegesRequest[] = [];
    const transport = createRouterTransport(({ service }) => {
      service(RoleService, {
        listRoleDefaultPrivileges(request) {
          requests.push(request);
          return create(ListRoleDefaultPrivilegesResponseSchema, {
            defaultPrivileges: [
              { creatorRoleName: "owner", privilege: "SELECT" },
            ],
            nextPageToken: "page-2",
          });
        },
      });
    });

    const { result } = renderHook(
      () =>
        useListRoleDefaultPrivilegesQuery(
          roleDefaultPrivilegesForDatabaseQueryInput(DATABASE_SCOPE)
        ),
      { wrapper: createWrapper(transport) }
    );

    await waitFor(() => {
      expect(result.current.isSuccess).toBe(true);
    });
    expect(requests).toHaveLength(1);
    expect(requests[0]?.parent).toBe(`instances/local/roles/${ROLE_ID}`);
    expect(requests[0]?.pageSize).toBe(TEST_NUMBER_1000);
    expect(requests[0]?.pageToken).toBe("");
    expect(
      result.current.data?.defaultPrivileges.map(
        (privilege) => privilege.privilege
      )
    ).toEqual(["SELECT"]);
    expect(result.current.data?.nextPageToken).toBe("page-2");
  });

  test("skips fetching default privileges when disabled", async () => {
    const requests: ListRoleDefaultPrivilegesRequest[] = [];
    const transport = createRouterTransport(({ service }) => {
      service(RoleService, {
        listRoleDefaultPrivileges(request) {
          requests.push(request);
          return create(ListRoleDefaultPrivilegesResponseSchema, {
            defaultPrivileges: [],
            nextPageToken: "",
          });
        },
      });
    });

    const { result } = renderHook(
      () =>
        useListRoleDefaultPrivilegesQuery(
          roleDefaultPrivilegesForDatabaseQueryInput(DATABASE_SCOPE),
          { enabled: false, refetchOnWindowFocus: false }
        ),
      { wrapper: createWrapper(transport) }
    );

    await flushMicrotasks();
    expect(result.current.fetchStatus).toBe("idle");
    expect(requests).toHaveLength(0);
  });
});

describe("useRolesAccessMapResourcesQuery", () => {
  test("loads PUBLIC grants when no roles are visible", async () => {
    const transport = createRouterTransport(({ service }) => {
      service(DatabaseService, {
        listDatabases() {
          return create(ListDatabasesResponseSchema, {
            databases: [
              {
                displayName: "logistics",
                name: "instances/local/databases/logistics",
              },
            ],
          });
        },
      });
      service(RoleService, {
        listPublicGrants() {
          return create(ListPublicGrantsResponseSchema, {
            grants: [{ privilege: "USAGE", schemaName: "public" }],
          });
        },
      });
    });

    const { result } = renderHook(
      () =>
        useRolesAccessMapResourcesQuery(
          { instanceId: "local", roles: [] },
          { refetchOnWindowFocus: false }
        ),
      { wrapper: createWrapper(transport) }
    );

    await waitFor(() => {
      expect(result.current.isSuccess).toBe(true);
    });
    expect(result.current.data?.publicAccess).toHaveLength(1);
    expect(result.current.data?.roleAccess).toEqual([]);
  });

  test("keeps one page per facet and reports truncated access data", async () => {
    const defaultPrivilegeRequests: ListRoleDefaultPrivilegesRequest[] = [];
    const grantRequests: ListRoleGrantsRequest[] = [];
    const ownedObjectRequests: ListRoleOwnedObjectsRequest[] = [];
    const publicGrantRequests: ListPublicGrantsRequest[] = [];
    const transport = createRouterTransport(({ service }) => {
      service(DatabaseService, {
        listDatabases() {
          return create(ListDatabasesResponseSchema, {
            databases: [
              {
                displayName: "logistics",
                isSystemDatabase: false,
                name: "instances/local/databases/logistics",
              },
            ],
            nextPageToken: "",
          });
        },
      });
      service(RoleService, {
        listPublicGrants(request) {
          publicGrantRequests.push(request);
          return create(ListPublicGrantsResponseSchema, {
            grants: [{ privilege: "USAGE", schemaName: "shipping" }],
            nextPageToken: "more-public-grants",
          });
        },
        listRoleDefaultPrivileges(request) {
          defaultPrivilegeRequests.push(request);
          return create(ListRoleDefaultPrivilegesResponseSchema, {
            defaultPrivileges: [
              {
                creatorRoleName: "app_owner",
                privilege: "SELECT",
                schemaName: "shipping",
              },
            ],
            nextPageToken: "more-default-privileges",
          });
        },
        listRoleGrants(request) {
          grantRequests.push(request);
          return create(ListRoleGrantsResponseSchema, {
            grants: [{ objectName: "orders", privilege: "SELECT" }],
            nextPageToken: "more-role-grants",
          });
        },
        listRoleOwnedObjects(request) {
          ownedObjectRequests.push(request);
          return create(ListRoleOwnedObjectsResponseSchema, {
            nextPageToken: "more-owned-objects",
            ownedObjects: [{ objectName: "orders", schemaName: "shipping" }],
          });
        },
      });
    });

    const { result } = renderHook(
      () =>
        useRolesAccessMapResourcesQuery(
          {
            instanceId: "local",
            roles: [
              create(RoleSchema, {
                name: `instances/local/roles/${ROLE_ID}`,
                roleName: "app_readonly",
              }),
            ],
          },
          { refetchOnWindowFocus: false }
        ),
      { wrapper: createWrapper(transport) }
    );

    await waitFor(() => {
      expect(result.current.isSuccess).toBe(true);
    });
    expect(publicGrantRequests).toHaveLength(1);
    expect(defaultPrivilegeRequests).toHaveLength(1);
    expect(grantRequests).toHaveLength(1);
    expect(ownedObjectRequests).toHaveLength(1);
    for (const request of [
      publicGrantRequests[0],
      defaultPrivilegeRequests[0],
      grantRequests[0],
      ownedObjectRequests[0],
    ]) {
      expect(request?.pageSize).toBe(TEST_NUMBER_1000);
      expect(request?.pageToken).toBe("");
    }
    expect(defaultPrivilegeRequests[0]?.database).toBe(
      "instances/local/databases/logistics"
    );
    expect(defaultPrivilegeRequests[0]?.parent).toBe(
      `instances/local/roles/${ROLE_ID}`
    );
    expect(
      result.current.data?.roleAccess[0]?.defaultPrivileges.map(
        (privilege) =>
          `${privilege.creatorRoleName}:${privilege.schemaName}:${privilege.privilege}`
      )
    ).toEqual(["app_owner:shipping:SELECT"]);
    expect(result.current.data?.publicAccess[0]?.grants).toHaveLength(1);
    expect(result.current.data?.roleAccess[0]?.grants).toHaveLength(1);
    expect(result.current.data?.roleAccess[0]?.ownedObjects).toHaveLength(1);
    expect(result.current.data?.failedRequestCount).toBe(0);
    expect(result.current.data?.truncatedRequestCount).toBe(TEST_NUMBER_4);
    expect(result.current.data?.budgetSkippedRequestCount).toBe(0);
  });

  test("keeps partial map data when one access request fails", async () => {
    const transport = createRouterTransport(({ service }) => {
      service(DatabaseService, {
        listDatabases() {
          return create(ListDatabasesResponseSchema, {
            databases: [
              {
                displayName: "logistics",
                isSystemDatabase: false,
                name: "instances/local/databases/logistics",
              },
            ],
          });
        },
      });
      service(RoleService, {
        listPublicGrants() {
          return create(ListPublicGrantsResponseSchema, { grants: [] });
        },
        listRoleDefaultPrivileges() {
          return create(ListRoleDefaultPrivilegesResponseSchema, {
            defaultPrivileges: [],
          });
        },
        listRoleGrants() {
          throw new Error("grants unavailable");
        },
        listRoleOwnedObjects() {
          return create(ListRoleOwnedObjectsResponseSchema, {
            ownedObjects: [
              {
                objectName: "logistics",
                objectType: GrantObjectType.DATABASE,
              },
            ],
          });
        },
      });
    });

    const { result } = renderHook(
      () =>
        useRolesAccessMapResourcesQuery(
          {
            instanceId: "local",
            roles: [
              create(RoleSchema, {
                name: `instances/local/roles/${ROLE_ID}`,
                roleName: "app_readonly",
              }),
            ],
          },
          { refetchOnWindowFocus: false }
        ),
      { wrapper: createWrapper(transport) }
    );

    await waitFor(() => {
      expect(result.current.isSuccess).toBe(true);
    });
    expect(result.current.data?.failedRequestCount).toBe(1);
    expect(result.current.data?.truncatedRequestCount).toBe(0);
    expect(result.current.data?.budgetSkippedRequestCount).toBe(0);
    expect(result.current.data?.roleAccess[0]?.grants).toEqual([]);
    expect(result.current.data?.roleAccess[0]?.ownedObjects).toHaveLength(1);
  });
});

describe("useRolesAccessMapResourcesQuery request budget", () => {
  test("does not build the full role and database pair cross-product", async () => {
    const roles = [
      create(RoleSchema, {
        name: `instances/local/roles/${ROLE_ID}`,
        roleName: "app_readonly",
      }),
    ];
    Object.defineProperty(roles, "flatMap", {
      value: () => {
        throw new Error("Role/database pairs must stay budget-bounded");
      },
    });
    const transport = createRouterTransport(({ service }) => {
      service(DatabaseService, {
        listDatabases() {
          return create(ListDatabasesResponseSchema, {
            databases: [
              {
                displayName: "logistics",
                name: "instances/local/databases/logistics",
              },
            ],
          });
        },
      });
      service(RoleService, {
        listPublicGrants() {
          return create(ListPublicGrantsResponseSchema, { grants: [] });
        },
        listRoleDefaultPrivileges() {
          return create(ListRoleDefaultPrivilegesResponseSchema, {
            defaultPrivileges: [],
          });
        },
        listRoleGrants() {
          return create(ListRoleGrantsResponseSchema, { grants: [] });
        },
        listRoleOwnedObjects() {
          return create(ListRoleOwnedObjectsResponseSchema, {
            ownedObjects: [],
          });
        },
      });
    });

    const { result } = renderHook(
      () =>
        useRolesAccessMapResourcesQuery(
          { instanceId: "local", roles },
          { refetchOnWindowFocus: false }
        ),
      { wrapper: createWrapper(transport) }
    );

    await waitFor(() => {
      expect(result.current.isSuccess).toBe(true);
    });
  });

  test("caps access requests without materializing skipped role data", async () => {
    const callOrder: string[] = [];
    const defaultPrivilegeRequests: ListRoleDefaultPrivilegesRequest[] = [];
    const grantRequests: ListRoleGrantsRequest[] = [];
    const ownedObjectRequests: ListRoleOwnedObjectsRequest[] = [];
    const publicGrantRequests: ListPublicGrantsRequest[] = [];
    const databases = Array.from({ length: 100 }, (_, index) => ({
      displayName: `database-${index}`,
      isSystemDatabase: false,
      name: `instances/local/databases/database-${index}`,
    }));

    const transport = createRouterTransport(({ service }) => {
      service(DatabaseService, {
        listDatabases() {
          return create(ListDatabasesResponseSchema, { databases });
        },
      });
      service(RoleService, {
        listPublicGrants(request) {
          publicGrantRequests.push(request);
          callOrder.push(`public:${request.parent}`);
          return create(ListPublicGrantsResponseSchema, {
            grants: [],
            nextPageToken: request.parent.endsWith("database-0")
              ? "more-public-grants"
              : "",
          });
        },
        listRoleDefaultPrivileges(request) {
          defaultPrivilegeRequests.push(request);
          callOrder.push(`default:${request.database}`);
          return create(ListRoleDefaultPrivilegesResponseSchema, {
            defaultPrivileges: [],
          });
        },
        listRoleGrants(request) {
          grantRequests.push(request);
          callOrder.push(`grant:${request.database}`);
          return create(ListRoleGrantsResponseSchema, {
            grants: [{ objectName: request.database, privilege: "SELECT" }],
            nextPageToken: request.database.endsWith("database-0")
              ? "more-role-grants"
              : "",
          });
        },
        listRoleOwnedObjects(request) {
          ownedObjectRequests.push(request);
          callOrder.push(`owned:${request.database}`);
          return create(ListRoleOwnedObjectsResponseSchema, {
            ownedObjects: [],
          });
        },
      });
    });

    const { result } = renderHook(
      () =>
        useRolesAccessMapResourcesQuery(
          {
            instanceId: "local",
            roles: [
              create(RoleSchema, {
                name: `instances/local/roles/${ROLE_ID}`,
                roleName: "app_readonly",
              }),
            ],
          },
          { refetchOnWindowFocus: false }
        ),
      { wrapper: createWrapper(transport) }
    );

    await waitFor(() => {
      expect(result.current.isSuccess).toBe(true);
    });
    expect(publicGrantRequests).toHaveLength(TEST_NUMBER_100);
    expect(defaultPrivilegeRequests).toHaveLength(TEST_NUMBER_66);
    expect(grantRequests).toHaveLength(TEST_NUMBER_66);
    expect(ownedObjectRequests).toHaveLength(TEST_NUMBER_66);
    expect(callOrder).toHaveLength(TEST_NUMBER_298);
    expect(
      callOrder
        .slice(0, TEST_NUMBER_100)
        .every((call) => call.startsWith("public:"))
    ).toBe(true);
    expect(result.current.data?.publicAccess).toHaveLength(TEST_NUMBER_100);
    expect(result.current.data?.roleAccess).toHaveLength(TEST_NUMBER_66);
    expect(result.current.data?.roleAccess[65]?.grants).toHaveLength(1);
    expect(result.current.data?.failedRequestCount).toBe(0);
    expect(result.current.data?.truncatedRequestCount).toBe(2);
    expect(result.current.data?.budgetSkippedRequestCount).toBe(
      TEST_NUMBER_102
    );
  });

  test("bounds concurrent access requests across role and database pairs", async () => {
    let activeRequests = 0;
    let maximumActiveRequests = 0;

    async function trackRequest<Response>(response: Response) {
      activeRequests += 1;
      maximumActiveRequests = Math.max(maximumActiveRequests, activeRequests);
      await Promise.resolve();
      activeRequests -= 1;
      return response;
    }

    const transport = createRouterTransport(({ service }) => {
      service(DatabaseService, {
        listDatabases() {
          return create(ListDatabasesResponseSchema, {
            databases: [
              {
                displayName: "logistics",
                name: "instances/local/databases/logistics",
              },
            ],
          });
        },
      });
      service(RoleService, {
        listPublicGrants() {
          return trackRequest(
            create(ListPublicGrantsResponseSchema, { grants: [] })
          );
        },
        listRoleDefaultPrivileges() {
          return trackRequest(
            create(ListRoleDefaultPrivilegesResponseSchema, {
              defaultPrivileges: [],
            })
          );
        },
        listRoleGrants() {
          return trackRequest(
            create(ListRoleGrantsResponseSchema, { grants: [] })
          );
        },
        listRoleOwnedObjects() {
          return trackRequest(
            create(ListRoleOwnedObjectsResponseSchema, { ownedObjects: [] })
          );
        },
      });
    });

    const { result } = renderHook(
      () =>
        useRolesAccessMapResourcesQuery(
          {
            instanceId: "local",
            roles: Array.from({ length: 5 }, (_, index) =>
              create(RoleSchema, {
                name: `instances/local/roles/role-${index}`,
                roleName: `role-${index}`,
              })
            ),
          },
          { refetchOnWindowFocus: false }
        ),
      { wrapper: createWrapper(transport) }
    );

    await waitFor(() => {
      expect(result.current.isSuccess).toBe(true);
    });
    expect(result.current.data?.roleAccess).toHaveLength(TEST_NUMBER_5);
    expect(maximumActiveRequests).toBeLessThanOrEqual(TEST_NUMBER_6);
  });

  test("starts the next role while an earlier access request is still pending", async () => {
    let releaseSlowRequest: () => void = () => undefined;
    const slowRequest = new Promise<void>((resolve) => {
      releaseSlowRequest = resolve;
    });
    let thirdRoleStarted = false;

    const transport = createRouterTransport(({ service }) => {
      service(DatabaseService, {
        listDatabases() {
          return create(ListDatabasesResponseSchema, {
            databases: [
              {
                displayName: "logistics",
                name: "instances/local/databases/logistics",
              },
            ],
          });
        },
      });
      service(RoleService, {
        listPublicGrants() {
          return create(ListPublicGrantsResponseSchema, { grants: [] });
        },
        listRoleDefaultPrivileges() {
          return create(ListRoleDefaultPrivilegesResponseSchema, {
            defaultPrivileges: [],
          });
        },
        async listRoleGrants(request) {
          if (request.parent.endsWith("/role-0")) {
            await slowRequest;
          }
          if (request.parent.endsWith("/role-2")) {
            thirdRoleStarted = true;
          }
          return create(ListRoleGrantsResponseSchema, { grants: [] });
        },
        listRoleOwnedObjects() {
          return create(ListRoleOwnedObjectsResponseSchema, {
            ownedObjects: [],
          });
        },
      });
    });

    const { result } = renderHook(
      () =>
        useRolesAccessMapResourcesQuery(
          {
            instanceId: "local",
            roles: Array.from({ length: 3 }, (_, index) =>
              create(RoleSchema, {
                name: `instances/local/roles/role-${index}`,
                roleName: `role-${index}`,
              })
            ),
          },
          { refetchOnWindowFocus: false }
        ),
      { wrapper: createWrapper(transport) }
    );

    try {
      await waitFor(() => {
        expect(thirdRoleStarted).toBe(true);
      });
    } finally {
      releaseSlowRequest();
    }
    await waitFor(() => {
      expect(result.current.isSuccess).toBe(true);
    });
  });
});

describe("useListPublicGrantsQuery", () => {
  test("keeps the first page and continuation token for public grants", async () => {
    const requests: ListPublicGrantsRequest[] = [];
    const transport = createRouterTransport(({ service }) => {
      service(RoleService, {
        listPublicGrants(request) {
          requests.push(request);
          return create(ListPublicGrantsResponseSchema, {
            grants: [{ objectName: "orders", privilege: "SELECT" }],
            nextPageToken: "page-2",
          });
        },
      });
    });

    const { result } = renderHook(
      () =>
        useListPublicGrantsQuery(
          publicGrantsForDatabaseQueryInput({
            databaseId: "postgres",
            instanceId: "local",
          })
        ),
      { wrapper: createWrapper(transport) }
    );

    await waitFor(() => {
      expect(result.current.isSuccess).toBe(true);
    });
    expect(requests).toHaveLength(1);
    expect(requests[0]?.parent).toBe("instances/local/databases/postgres");
    expect(requests[0]?.pageSize).toBe(TEST_NUMBER_1000);
    expect(requests[0]?.pageToken).toBe("");
    expect(result.current.data?.grants.map((grant) => grant.privilege)).toEqual(
      ["SELECT"]
    );
    expect(result.current.data?.nextPageToken).toBe("page-2");
  });

  test("skips fetching public grants when disabled", async () => {
    const requests: ListPublicGrantsRequest[] = [];
    const transport = createRouterTransport(({ service }) => {
      service(RoleService, {
        listPublicGrants(request) {
          requests.push(request);
          return create(ListPublicGrantsResponseSchema, {
            grants: [],
            nextPageToken: "",
          });
        },
      });
    });

    const { result } = renderHook(
      () =>
        useListPublicGrantsQuery(
          publicGrantsForDatabaseQueryInput({
            databaseId: "postgres",
            instanceId: "local",
          }),
          { enabled: false, refetchOnWindowFocus: false }
        ),
      { wrapper: createWrapper(transport) }
    );

    await flushMicrotasks();
    expect(result.current.fetchStatus).toBe("idle");
    expect(requests).toHaveLength(0);
  });
});
