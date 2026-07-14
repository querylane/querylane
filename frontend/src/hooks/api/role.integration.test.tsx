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
  useListAllPublicGrantsQuery,
  useListAllRoleDefaultPrivilegesQuery,
  useListAllRoleGrantsQuery,
  useListAllRoleOwnedObjectsQuery,
  useListAllRolesQuery,
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
import {
  listPublicGrants,
  listRoleDefaultPrivileges,
  listRoleGrants,
  listRoleOwnedObjects,
  listRoles,
} from "@/protogen/querylane/console/v1alpha1/role-RoleService_connectquery";

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
  for (let tick = 0; tick < ticks; tick += 1) {
    await act(async () => {
      await Promise.resolve();
    });
  }
}

afterEach(async () => {
  cleanup();
  // Drop cached queries so pending garbage-collection timers do not outlive
  // the test.
  for (const queryClient of activeQueryClients.splice(0)) {
    await queryClient.cancelQueries();
    queryClient.clear();
  }
});

describe("aggregate role query keys", () => {
  test("derive every list-all cache from its Connect Query method", () => {
    const transport = createRouterTransport(() => undefined);
    const queryClient = new QueryClient({
      defaultOptions: {
        queries: { gcTime: TEST_GC_TIME, retry: false },
      },
    });
    const rolesInput = rolesForInstanceQueryInput("local");
    const grantsInput = roleGrantsForDatabaseQueryInput(DATABASE_SCOPE);
    const ownedObjectsInput =
      roleOwnedObjectsForDatabaseQueryInput(DATABASE_SCOPE);
    const defaultPrivilegesInput =
      roleDefaultPrivilegesForDatabaseQueryInput(DATABASE_SCOPE);
    const publicGrantsInput = publicGrantsForDatabaseQueryInput(DATABASE_SCOPE);

    renderHook(
      () => {
        useListAllRolesQuery(rolesInput, { enabled: false });
        useListAllRoleGrantsQuery(grantsInput, { enabled: false });
        useListAllRoleOwnedObjectsQuery(ownedObjectsInput, { enabled: false });
        useListAllRoleDefaultPrivilegesQuery(defaultPrivilegesInput, {
          enabled: false,
        });
        useListAllPublicGrantsQuery(publicGrantsInput, { enabled: false });
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
      createConnectListAllQueryKey({
        input: grantsInput,
        method: listRoleGrants,
        transport,
      }),
      createConnectListAllQueryKey({
        input: ownedObjectsInput,
        method: listRoleOwnedObjects,
        transport,
      }),
      createConnectListAllQueryKey({
        input: defaultPrivilegesInput,
        method: listRoleDefaultPrivileges,
        transport,
      }),
      createConnectListAllQueryKey({
        input: publicGrantsInput,
        method: listPublicGrants,
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
    expect(requests[0]?.pageSize).toBe(1000);
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

describe("useListAllRoleGrantsQuery", () => {
  test("collects every page of grants for the database-scoped input", async () => {
    const requests: ListRoleGrantsRequest[] = [];
    const transport = createRouterTransport(({ service }) => {
      service(RoleService, {
        listRoleGrants(request) {
          requests.push(request);
          if (request.pageToken === "") {
            return create(ListRoleGrantsResponseSchema, {
              grants: [{ objectName: "orders", privilege: "SELECT" }],
              nextPageToken: "page-2",
            });
          }
          return create(ListRoleGrantsResponseSchema, {
            grants: [{ objectName: "orders", privilege: "UPDATE" }],
            nextPageToken: "",
          });
        },
      });
    });

    const { result } = renderHook(
      () =>
        useListAllRoleGrantsQuery(
          roleGrantsForDatabaseQueryInput(DATABASE_SCOPE)
        ),
      { wrapper: createWrapper(transport) }
    );

    await waitFor(() => {
      expect(result.current.isSuccess).toBe(true);
    });
    expect(requests).toHaveLength(2);
    expect(requests[0]?.parent).toBe(`instances/local/roles/${ROLE_ID}`);
    expect(requests[0]?.database).toBe("instances/local/databases/postgres");
    expect(result.current.data?.grants.map((grant) => grant.privilege)).toEqual(
      ["SELECT", "UPDATE"]
    );
    expect(result.current.data?.nextPageToken).toBe("");
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
        useListAllRoleGrantsQuery(
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

describe("useListAllRoleOwnedObjectsQuery", () => {
  test("collects every page of owned objects for the database-scoped input", async () => {
    const requests: ListRoleOwnedObjectsRequest[] = [];
    const transport = createRouterTransport(({ service }) => {
      service(RoleService, {
        listRoleOwnedObjects(request) {
          requests.push(request);
          if (request.pageToken === "") {
            return create(ListRoleOwnedObjectsResponseSchema, {
              nextPageToken: "page-2",
              ownedObjects: [{ objectName: "orders", schemaName: "public" }],
            });
          }
          return create(ListRoleOwnedObjectsResponseSchema, {
            nextPageToken: "",
            ownedObjects: [{ objectName: "invoices", schemaName: "public" }],
          });
        },
      });
    });

    const { result } = renderHook(
      () =>
        useListAllRoleOwnedObjectsQuery(
          roleOwnedObjectsForDatabaseQueryInput(DATABASE_SCOPE)
        ),
      { wrapper: createWrapper(transport) }
    );

    await waitFor(() => {
      expect(result.current.isSuccess).toBe(true);
    });
    expect(requests).toHaveLength(2);
    expect(requests[0]?.parent).toBe(`instances/local/roles/${ROLE_ID}`);
    expect(
      result.current.data?.ownedObjects.map((owned) => owned.objectName)
    ).toEqual(["orders", "invoices"]);
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
        useListAllRoleOwnedObjectsQuery(
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

describe("useListAllRoleDefaultPrivilegesQuery", () => {
  test("collects every page of default privileges for the database-scoped input", async () => {
    const requests: ListRoleDefaultPrivilegesRequest[] = [];
    const transport = createRouterTransport(({ service }) => {
      service(RoleService, {
        listRoleDefaultPrivileges(request) {
          requests.push(request);
          if (request.pageToken === "") {
            return create(ListRoleDefaultPrivilegesResponseSchema, {
              defaultPrivileges: [
                { creatorRoleName: "owner", privilege: "SELECT" },
              ],
              nextPageToken: "page-2",
            });
          }
          return create(ListRoleDefaultPrivilegesResponseSchema, {
            defaultPrivileges: [
              { creatorRoleName: "owner", privilege: "INSERT" },
            ],
            nextPageToken: "",
          });
        },
      });
    });

    const { result } = renderHook(
      () =>
        useListAllRoleDefaultPrivilegesQuery(
          roleDefaultPrivilegesForDatabaseQueryInput(DATABASE_SCOPE)
        ),
      { wrapper: createWrapper(transport) }
    );

    await waitFor(() => {
      expect(result.current.isSuccess).toBe(true);
    });
    expect(requests).toHaveLength(2);
    expect(requests[0]?.parent).toBe(`instances/local/roles/${ROLE_ID}`);
    expect(
      result.current.data?.defaultPrivileges.map(
        (privilege) => privilege.privilege
      )
    ).toEqual(["SELECT", "INSERT"]);
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
        useListAllRoleDefaultPrivilegesQuery(
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
  test("collects default privileges beside grants and owned objects for the map", async () => {
    const defaultPrivilegeRequests: ListRoleDefaultPrivilegesRequest[] = [];
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
        listPublicGrants() {
          return create(ListPublicGrantsResponseSchema, {
            grants: [],
            nextPageToken: "",
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
            nextPageToken: "",
          });
        },
        listRoleGrants() {
          return create(ListRoleGrantsResponseSchema, {
            grants: [],
            nextPageToken: "",
          });
        },
        listRoleOwnedObjects() {
          return create(ListRoleOwnedObjectsResponseSchema, {
            nextPageToken: "",
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
    expect(defaultPrivilegeRequests).toHaveLength(1);
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
    expect(result.current.data?.roleAccess[0]?.grants).toEqual([]);
    expect(result.current.data?.roleAccess[0]?.ownedObjects).toHaveLength(1);
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
    expect(result.current.data?.roleAccess).toHaveLength(5);
    expect(maximumActiveRequests).toBeLessThanOrEqual(6);
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

describe("useListAllPublicGrantsQuery", () => {
  test("collects every page of public grants for the database input", async () => {
    const requests: ListPublicGrantsRequest[] = [];
    const transport = createRouterTransport(({ service }) => {
      service(RoleService, {
        listPublicGrants(request) {
          requests.push(request);
          if (request.pageToken === "") {
            return create(ListPublicGrantsResponseSchema, {
              grants: [{ objectName: "orders", privilege: "SELECT" }],
              nextPageToken: "page-2",
            });
          }
          return create(ListPublicGrantsResponseSchema, {
            grants: [{ privilege: "USAGE", schemaName: "public" }],
            nextPageToken: "",
          });
        },
      });
    });

    const { result } = renderHook(
      () =>
        useListAllPublicGrantsQuery(
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
    expect(requests).toHaveLength(2);
    expect(requests[0]?.parent).toBe("instances/local/databases/postgres");
    expect(result.current.data?.grants.map((grant) => grant.privilege)).toEqual(
      ["SELECT", "USAGE"]
    );
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
        useListAllPublicGrantsQuery(
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
