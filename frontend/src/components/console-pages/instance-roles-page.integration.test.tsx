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
  navigate: vi.fn(),
  tableSearch: "",
}));

const SUPERUSERS_CHIP_NAME = /Superusers 1/;
const BUILT_IN_CHIP_NAME = /Built-in 1/;

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
  useRolesAccessMapResourcesQuery: () => ({
    data: {
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
    },
    error: null,
    isPending: false,
  }),
}));

afterEach(() => {
  cleanup();
  vi.clearAllMocks();
  mocks.tableSearch = "";
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

  test("filters roles by URL type and writes chip changes back to search", async () => {
    const user = userEvent.setup();

    render(
      <InstanceRolesPage instanceId="prod" tab={undefined} type="login" />
    );

    expect(screen.getByText("app_user")).toBeTruthy();
    expect(screen.queryByText("app_group")).toBeNull();
    expect(screen.queryByText("replicator")).toBeNull();

    await user.click(
      screen.getByRole("button", { name: SUPERUSERS_CHIP_NAME })
    );

    const navigateCall = mocks.navigate.mock.calls[0]?.[0];
    expect(navigateCall.search({ q: "app", type: "login" })).toEqual({
      q: "app",
      type: "super",
    });
  });

  test("shows built-in roles in the redesigned access map by default", () => {
    render(<InstanceRolesPage instanceId="prod" tab="map" />);

    const canvas = screen.getByLabelText("Role access map");
    expect(canvas.textContent).toContain("pg_read_all_data");
    expect(
      screen.getByRole("button", { name: BUILT_IN_CHIP_NAME })
    ).toBeTruthy();
  });
});
