import { create } from "@bufbuild/protobuf";
import { cleanup, render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, describe, expect, test, vi } from "vitest";
import { InstanceRolesPage } from "@/components/console-pages/instance-roles-page";
import {
  GrantObjectType,
  ObjectGrantSchema,
  OwnedObjectSchema,
  RoleAttributesSchema,
  RoleMembershipSchema,
  RoleSchema,
} from "@/protogen/querylane/console/v1alpha1/role_pb";

const mocks = vi.hoisted(() => ({
  accessMapPending: false,
  accessMapRoleNames: [] as string[],
  budgetSkippedRequestCount: 0,
  failedRequestCount: 0,
  navigate: vi.fn(),
  tableSearch: "",
  truncatedRequestCount: 0,
}));

const SUPERUSERS_FILTER_OPTION_NAME = /Superusers 1/;
const BUILT_IN_FILTER_OPTION_NAME = /Built-in 1/;
const TYPE_FILTER_BUTTON_NAME = /^Type/;

vi.mock("@tanstack/react-router", () => ({
  useNavigate: () => mocks.navigate,
}));

vi.mock("@/lib/url-search-state", () => ({
  useUrlTableSearch: () => [mocks.tableSearch, vi.fn()] as const,
}));

vi.mock("@/hooks/api/role", () => ({
  rolesForInstanceQueryInput: (instanceId: string) => ({
    parent: `instances/${instanceId}`,
  }),
  useListAllRolesQuery: () => ({
    data: {
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
    error: null,
    isPending: false,
    refetch: vi.fn(async () => undefined),
  }),
  useRolesAccessMapResourcesQuery: (input: {
    roles: { roleName: string }[];
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
  mocks.accessMapPending = false;
  mocks.accessMapRoleNames = [];
  mocks.budgetSkippedRequestCount = 0;
  mocks.failedRequestCount = 0;
  cleanup();
  vi.clearAllMocks();
  mocks.tableSearch = "";
  mocks.truncatedRequestCount = 0;
});

describe("InstanceRolesPage", () => {
  test("keeps roles table as the default tab and writes access map tab to the URL search", async () => {
    const user = userEvent.setup();

    render(
      <InstanceRolesPage instanceId="prod" tab={undefined} type="login" />
    );

    const tableTab = screen.getByRole("tab", { name: "Table" });
    const mapTab = screen.getByRole("tab", { name: "Access map" });
    expect(tableTab.hasAttribute("data-active")).toBe(true);
    expect(mapTab.hasAttribute("data-active")).toBe(false);
    expect(screen.getByPlaceholderText("Search roles…")).toBeTruthy();
    expect(screen.queryByLabelText("Role access map")).toBeNull();

    await user.click(mapTab);

    const navigateCall = mocks.navigate.mock.calls[0]?.[0];
    expect(navigateCall.search({ q: "app", type: "login" })).toEqual({
      q: "app",
      tab: "map",
      type: "login",
    });
  });

  test("hydrates the access map tab from URL search and shows object access", async () => {
    const user = userEvent.setup();

    render(<InstanceRolesPage instanceId="prod" tab="map" type="login" />);

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
    expect(
      navigateCall.search({ q: "app", tab: "map", type: "login" })
    ).toEqual({
      q: "app",
      tab: undefined,
      type: "login",
    });
  });

  test("does not show the empty grants state while object access is loading", () => {
    mocks.accessMapPending = true;

    render(<InstanceRolesPage instanceId="prod" tab="map" />);

    expect(screen.getByText("Loading role object access.")).toBeTruthy();
    expect(
      screen.queryByText("No object grants found for the visible roles.")
    ).toBeNull();
  });

  test("filters roles by URL type with the shared type filter", async () => {
    const user = userEvent.setup();

    render(
      <InstanceRolesPage instanceId="prod" tab={undefined} type="login" />
    );

    expect(screen.getByText("app_user")).toBeTruthy();
    expect(screen.queryByText("app_group")).toBeNull();
    expect(screen.queryByText("replicator")).toBeNull();

    await user.click(
      screen.getByRole("button", { name: TYPE_FILTER_BUTTON_NAME })
    );
    await user.click(
      screen.getByRole("option", { name: SUPERUSERS_FILTER_OPTION_NAME })
    );

    const navigateCall = mocks.navigate.mock.calls[0]?.[0];
    expect(navigateCall.search({ q: "app", type: "login" })).toEqual({
      q: "app",
      type: "super",
    });
  });

  test("shows built-in roles in the redesigned access map by default", async () => {
    const user = userEvent.setup();

    render(<InstanceRolesPage instanceId="prod" tab="map" />);

    const canvas = screen.getByLabelText("Role access map");
    expect(canvas.textContent).toContain("pg_read_all_data");
    await user.click(screen.getByRole("button", { name: "Type" }));
    expect(
      screen.getByRole("option", { name: BUILT_IN_FILTER_OPTION_NAME })
    ).toBeTruthy();
  });

  test("keeps partial access data visible with a warning", () => {
    mocks.failedRequestCount = 2;

    render(<InstanceRolesPage instanceId="prod" tab="map" />);

    expect(
      screen.getByText(
        "2 access requests could not be loaded. The map shows the available data."
      )
    ).toBeTruthy();
    expect(screen.getByText("orders")).toBeTruthy();
  });

  test("warns when access results are truncated and keeps the map visible", () => {
    mocks.truncatedRequestCount = 1;

    render(<InstanceRolesPage instanceId="prod" tab="map" />);

    const warning = screen.getByRole("status");
    expect(warning.textContent).toContain("Some access data is not shown");
    expect(warning.textContent).toContain(
      "The access map reached a result or request limit. It shows available results; counts and relationships may be incomplete."
    );
    expect(screen.getByText("orders")).toBeTruthy();
  });

  test("warns when the access-map request budget skips results", () => {
    mocks.budgetSkippedRequestCount = 1;

    render(<InstanceRolesPage instanceId="prod" tab="map" />);

    expect(screen.getByRole("status").textContent).toContain(
      "Some access data is not shown"
    );
    expect(screen.getByText("orders")).toBeTruthy();
  });
});
