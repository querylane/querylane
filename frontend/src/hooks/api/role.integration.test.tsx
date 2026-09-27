import { create } from "@bufbuild/protobuf";
import type { Transport } from "@connectrpc/connect";
import { TransportProvider } from "@connectrpc/connect-query";
import { afterEach, describe, expect, test } from "@rstest/core";
import { type QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { cleanup, renderHook, waitFor } from "@testing-library/react";
import type { ReactNode } from "react";
import {
  useListAllRolesQuery,
  useRolesAccessMapResourcesQuery,
} from "@/hooks/api/role";
import {
  DatabaseService,
  ListDatabasesResponseSchema,
} from "@/protogen/querylane/console/v1alpha1/database_pb";
import {
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
import { createTestQueryClient } from "@/test/query-client";
import { createTestRouterTransport } from "@/test/router-transport";

const ROLE_ID = "YWxpY2U";

const activeQueryClients: QueryClient[] = [];

function createWrapper(
  transport: Transport,
  queryClient = createTestQueryClient()
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

describe("useListAllRolesQuery", () => {
  test("collects every page of roles into a single response", async () => {
    const requests: ListRolesRequest[] = [];
    const transport = createTestRouterTransport(({ service }) => {
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
});

describe("useRolesAccessMapResourcesQuery request budget", () => {
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

    const transport = createTestRouterTransport(({ service }) => {
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

    await waitFor(
      () => {
        expect(result.current.isSuccess).toBe(true);
      },
      { timeout: 10_000 }
    );
    expect(publicGrantRequests).toHaveLength(100);
    expect(defaultPrivilegeRequests).toHaveLength(66);
    expect(grantRequests).toHaveLength(66);
    expect(ownedObjectRequests).toHaveLength(66);
    expect(callOrder).toHaveLength(298);
    expect(
      callOrder.slice(0, 100).every((call) => call.startsWith("public:"))
    ).toBe(true);
    expect(result.current.data?.publicAccess).toHaveLength(100);
    expect(result.current.data?.roleAccess).toHaveLength(66);
    expect(result.current.data?.roleAccess[65]?.grants).toHaveLength(1);
    expect(result.current.data?.failedRequestCount).toBe(0);
    expect(result.current.data?.truncatedRequestCount).toBe(2);
    expect(result.current.data?.budgetSkippedRequestCount).toBe(102);
  }, 15_000);
});
