import { create } from "@bufbuild/protobuf";
import { FieldMaskSchema } from "@bufbuild/protobuf/wkt";
import { afterEach, describe, expect, rs, test } from "@rstest/core";
import { act, cleanup, render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { InstanceRolesPage } from "@/components/console-pages/instance-roles-page";
import {
  GrantObjectType,
  ObjectGrantSchema,
  OwnedObjectSchema,
  RoleAttributesSchema,
  RoleMembershipSchema,
  RoleSchema,
} from "@/protogen/querylane/console/v1alpha1/role_pb";

const MATCH_PATTERN_1 = /Role/u;
const MATCH_PATTERN_2 = /0 roles/u;
const MATCH_PATTERN_3 = /Page 1 of/u;

const mocks = rs.hoisted(
  (): {
    accessMapPending: boolean;
    rolesPending: boolean;
    rolesError: Error | null;
    accessMapRoleNames: string[];
    budgetSkippedRequestCount: number;
    failedRequestCount: number;
    navigate: ReturnType<
      typeof rs.fn<
        (options: {
          search: (previous: Record<string, unknown>) => unknown;
        }) => unknown
      >
    >;
    roleQueryInputs: {
      filter?: string;
      parent: string;
    }[];
    tableSearch: string;
    truncatedRequestCount: number;
  } => ({
    accessMapPending: false,
    rolesPending: false,
    rolesError: null,
    accessMapRoleNames: [] as string[],
    budgetSkippedRequestCount: 0,
    failedRequestCount: 0,
    navigate: rs.fn(),
    roleQueryInputs: [] as {
      filter?: string;
      parent: string;
    }[],
    tableSearch: "",
    truncatedRequestCount: 0,
  })
);

rs.mock("@tanstack/react-router", () => ({
  useNavigate: () => mocks.navigate,
}));

rs.mock("@/lib/url-search-state", () => ({
  useUrlTableSearch: () =>
    [mocks.tableSearch, rs.fn(), rs.fn(async () => true)] as const,
  useUrlTableSorting: () =>
    [[{ id: "roleName", desc: false }], rs.fn()] as const,
}));

rs.mock("@/hooks/api/role", () => ({
  rolesForInstanceQueryInput: (instanceId: string) => ({
    parent: `instances/${instanceId}`,
  }),
  useListAllRolesQuery: (input: { filter?: string; parent: string }) => {
    mocks.roleQueryInputs.push(input);
    return {
      data: mocks.rolesPending
        ? undefined
        : {
            roles: [
              create(RoleSchema, {
                attributes: create(RoleAttributesSchema, { canLogin: true }),
                memberOf: [
                  create(RoleMembershipSchema, {
                    role: "instances/prod/roles/app_group",
                    roleName: "app_group",
                  }),
                ],
                name: "instances/prod/roles/app_user",
                roleName: "app_user",
              }),
              create(RoleSchema, {
                attributes: create(RoleAttributesSchema, { canLogin: false }),
                name: "instances/prod/roles/app_group",
                roleName: "app_group",
              }),
              create(RoleSchema, {
                attributes: create(RoleAttributesSchema, {
                  canLogin: true,
                  canReplicate: true,
                }),
                name: "instances/prod/roles/replicator",
                roleName: "replicator",
              }),
              create(RoleSchema, {
                attributes: create(RoleAttributesSchema, {
                  canLogin: true,
                  isSuperuser: true,
                }),
                name: "instances/prod/roles/postgres",
                roleName: "postgres",
              }),
              create(RoleSchema, {
                isSystemRole: true,
                name: "instances/prod/roles/pg_read_all_data",
                roleName: "pg_read_all_data",
              }),
            ],
          },
      error: mocks.rolesError,
      isPending: mocks.rolesPending,
      isFetching: mocks.rolesPending,
      refetch: rs.fn(async () => undefined),
    };
  },
  useRolesAccessMapResourcesQuery: (input: {
    roles: {
      roleName: string;
    }[];
  }) => {
    mocks.accessMapRoleNames = input.roles.map((role) => role.roleName);
    const result = {
      data: {
        budgetSkippedRequestCount: mocks.budgetSkippedRequestCount,
        failedRequestCount: mocks.failedRequestCount,
        publicAccess: [
          {
            databaseId: "logistics",
            databaseName: "logistics",
            grants: [
              create(ObjectGrantSchema, {
                objectType: GrantObjectType.SCHEMA,
                privilege: "USAGE",
                schemaName: "public",
              }),
            ],
          },
        ],
        roleAccess: [
          {
            databaseId: "logistics",
            databaseName: "logistics",
            grants: [
              create(ObjectGrantSchema, {
                objectName: "orders",
                objectType: GrantObjectType.TABLE,
                privilege: "SELECT",
                schemaName: "shipping",
              }),
            ],
            ownedObjects: [
              create(OwnedObjectSchema, {
                objectName: "logistics",
                objectType: GrantObjectType.DATABASE,
              }),
            ],
            roleId: "app_user",
            roleName: "app_user",
          },
        ],
        truncatedRequestCount: mocks.truncatedRequestCount,
      },
      error: null,
      isPending: mocks.accessMapPending,
    };
    if (mocks.accessMapPending) {
      result.data.publicAccess = [];
      result.data.roleAccess = [];
    }
    return result;
  },
}));

afterEach(() => {
  rs.useRealTimers();
  mocks.accessMapPending = false;
  mocks.rolesPending = false;
  mocks.rolesError = null;
  mocks.accessMapRoleNames = [];
  mocks.budgetSkippedRequestCount = 0;
  mocks.failedRequestCount = 0;
  mocks.roleQueryInputs = [];
  cleanup();
  rs.clearAllMocks();
  mocks.tableSearch = "";
  mocks.truncatedRequestCount = 0;
});

describe("instance roles page", () => {
  test("debounces role search requests", async () => {
    rs.useFakeTimers();
    const { rerender } = render(
      <InstanceRolesPage
        instanceId="prod"
        searchRoute="/instances/$instanceId/roles/"
        tab={undefined}
        type={undefined}
      />
    );
    mocks.roleQueryInputs = [];
    mocks.tableSearch = "post";

    rerender(
      <InstanceRolesPage
        instanceId="prod"
        searchRoute="/instances/$instanceId/roles/"
        tab={undefined}
        type={undefined}
      />
    );

    expect(mocks.roleQueryInputs).not.toContainEqual({
      filter: 'role_name:"post"',
      parent: "instances/prod",
      readMask: create(FieldMaskSchema, {
        paths: [
          "attributes.can_login",
          "attributes.can_replicate",
          "attributes.connection_limit",
          "attributes.is_superuser",
          "comment",
          "is_system_role",
          "name",
          "role_name",
        ],
      }),
    });
    await act(async () => {
      rs.advanceTimersByTime(200);
    });
    expect(mocks.roleQueryInputs).toContainEqual({
      filter: 'role_name:"post"',
      parent: "instances/prod",
      readMask: create(FieldMaskSchema, {
        paths: [
          "attributes.can_login",
          "attributes.can_replicate",
          "attributes.connection_limit",
          "attributes.is_superuser",
          "comment",
          "is_system_role",
          "name",
          "role_name",
        ],
      }),
    });
  });

  test("hydrates the access map tab from URL search and shows object access", async () => {
    const user = userEvent.setup();

    render(
      <InstanceRolesPage
        instanceId="prod"
        searchRoute="/instances/$instanceId/roles/"
        tab="map"
        type="login"
      />
    );

    expect(
      screen
        .getByRole("tab", { name: "Access map" })
        .hasAttribute("data-active")
    ).toBe(true);
    expect(screen.getByLabelText("Role access map")).toBeTruthy();
    expect(screen.getByText("Objects")).toBeTruthy();
    expect(screen.getByText("orders")).toBeTruthy();
    expect(screen.getByText("logistics")).toBeTruthy();
    expect(screen.getByText("PUBLIC")).toBeTruthy();
    expect(screen.getByPlaceholderText("Search roles…")).toBeTruthy();
    expect(mocks.accessMapRoleNames).toEqual(["app_user"]);

    await user.click(screen.getByRole("tab", { name: "Table" }));

    const navigateCall = mocks.navigate.mock.calls[0]?.[0];
    if (!navigateCall) {
      throw new Error("Expected navigation call");
    }
    expect(
      navigateCall.search({
        q: "app",
        sort: "connLimit:desc",
        tab: "map",
        type: "login",
      })
    ).toEqual({
      q: "app",
      sort: "connLimit:desc",
      tab: undefined,
      type: "login",
    });
  });

  test("hides built-in roles until they are enabled from the map view", async () => {
    const user = userEvent.setup();

    render(
      <InstanceRolesPage
        instanceId="prod"
        searchRoute="/instances/$instanceId/roles/"
        tab="map"
      />
    );

    const canvas = screen.getByLabelText("Role access map");
    expect(canvas.textContent).not.toContain("pg_read_all_data");
    expect(mocks.accessMapRoleNames).not.toContain("pg_read_all_data");

    await user.click(screen.getByRole("button", { name: "View" }));
    await user.click(screen.getByRole("switch", { name: "Built-in roles" }));

    expect(canvas.textContent).toContain("pg_read_all_data");
    expect(mocks.accessMapRoleNames).toContain("pg_read_all_data");
  });
});

test("initial role loading keeps search, headers and reserved footer without false counts, then recovers", () => {
  mocks.rolesPending = true;
  const { rerender } = render(
    <InstanceRolesPage
      instanceId="prod"
      searchRoute="/instances/$instanceId/roles/"
    />
  );
  const search = screen.getByRole("textbox", { name: "Search roles…" });
  search.focus();
  expect(document.activeElement).toBe(search);
  expect(
    screen.getByRole("columnheader", { name: MATCH_PATTERN_1 })
  ).toBeTruthy();
  expect(screen.getByRole("status").textContent).toBe(
    "Loading matching roles…"
  );
  expect(screen.queryByText(MATCH_PATTERN_2)).toBeNull();
  expect(screen.queryByText(MATCH_PATTERN_3)).toBeNull();
  mocks.rolesPending = false;
  rerender(
    <InstanceRolesPage
      instanceId="prod"
      searchRoute="/instances/$instanceId/roles/"
    />
  );
  expect(screen.getByText("app_user")).toBeTruthy();
  expect(screen.getByRole("textbox", { name: "Search roles…" })).toBe(search);
  expect(search.isConnected).toBe(true);
  expect(document.activeElement).toBe(search);
  mocks.rolesError = new Error("roles unavailable");
  rerender(
    <InstanceRolesPage
      instanceId="prod"
      searchRoute="/instances/$instanceId/roles/"
    />
  );
  expect(screen.getByRole("alert").textContent).toBe(
    "Could not load matching roles."
  );
});
