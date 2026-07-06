import { create } from "@bufbuild/protobuf";
import {
  cleanup,
  render,
  screen,
  waitFor,
  within,
} from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, describe, expect, test, vi } from "vitest";
import { InstanceRolesPage } from "@/components/console-pages/instance-roles-page";
import {
  RoleAttributesSchema,
  RoleMembershipSchema,
  RoleSchema,
} from "@/protogen/querylane/console/v1alpha1/role_pb";

const mocks = vi.hoisted(() => ({
  navigate: vi.fn(),
  tableSearch: "",
}));
const ROLE_TYPE_USER_FILTER_RE = /Type.*User/;
const SUPERUSER_OPTION_WITH_COUNT_RE = /Superuser\s+1/;

vi.mock("@tanstack/react-router", () => ({
  useNavigate: () => mocks.navigate,
}));

vi.mock("@/lib/url-search-state", () => ({
  useUrlTableSearch: () => [mocks.tableSearch, vi.fn()] as const,
}));

vi.mock("@/features/database-visualization/flow-canvas", () => ({
  ["FlowCanvas"]: ({
    actionPanel,
    nodes,
  }: {
    actionPanel?: React.ReactNode | undefined;
    nodes: { id: string }[];
  }) => (
    <section aria-label="Role access flow canvas">
      <fieldset aria-label="Role access canvas controls">
        {actionPanel}
      </fieldset>
      <span>Node ids {nodes.map((node) => node.id).join(",")}</span>
    </section>
  ),
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
}));

afterEach(() => {
  cleanup();
  vi.clearAllMocks();
  mocks.tableSearch = "";
});

describe("InstanceRolesPage", () => {
  test("keeps roles details as the default tab and writes map tab to the URL search", async () => {
    const user = userEvent.setup();

    render(
      <InstanceRolesPage instanceId="prod" tab={undefined} type="login" />
    );

    const detailsTab = screen.getByRole("tab", { name: "Details" });
    const mapTab = screen.getByRole("tab", { name: "Map" });
    expect(detailsTab.hasAttribute("data-active")).toBe(true);
    expect(mapTab.hasAttribute("data-active")).toBe(false);
    expect(screen.getByPlaceholderText("Search roles...")).toBeTruthy();
    expect(
      screen.queryByRole("heading", { name: "Role access map" })
    ).toBeNull();

    await user.click(mapTab);

    const navigateCall = mocks.navigate.mock.calls[0]?.[0];
    expect(navigateCall.search({ q: "app", type: "login" })).toEqual({
      q: "app",
      tab: "map",
      type: "login",
    });
  });

  test("hydrates the roles map tab from URL search and clears it when returning to details", async () => {
    const user = userEvent.setup();

    render(<InstanceRolesPage instanceId="prod" tab="map" type="login" />);

    const mapTab = screen.getByRole("tab", { name: "Map" });
    expect(mapTab.hasAttribute("data-active")).toBe(true);
    expect(
      await screen.findByLabelText("Role access flow canvas")
    ).toBeTruthy();
    expect(screen.queryByPlaceholderText("Search roles...")).toBeNull();

    await user.click(screen.getByRole("tab", { name: "Details" }));

    const navigateCall = mocks.navigate.mock.calls[0]?.[0];
    expect(
      navigateCall.search({ q: "app", tab: "map", type: "login" })
    ).toEqual({
      q: "app",
      tab: undefined,
      type: "login",
    });
  });

  test("filters roles by URL type and writes shared facet changes back to search", async () => {
    const user = userEvent.setup();

    render(
      <InstanceRolesPage instanceId="prod" tab={undefined} type="login" />
    );

    expect(screen.getByText("app_user")).toBeTruthy();
    expect(screen.queryByText("app_group")).toBeNull();
    expect(screen.queryByText("replicator")).toBeNull();

    await user.click(
      screen.getByRole("button", { name: ROLE_TYPE_USER_FILTER_RE })
    );
    await user.click(
      screen.getByRole("option", { name: SUPERUSER_OPTION_WITH_COUNT_RE })
    );

    const navigateCall = mocks.navigate.mock.calls[0]?.[0];
    expect(navigateCall.search({ q: "app", type: "login" })).toEqual({
      q: "app",
      type: "super",
    });
  });

  test("places role search on the left with the type filter directly after it", () => {
    render(<InstanceRolesPage instanceId="prod" tab={undefined} />);

    const search = screen.getByRole("textbox", { name: "Search roles..." });
    const filterBar = search.closest('[data-slot="roles-filter-bar"]');
    if (!(filterBar instanceof HTMLElement)) {
      throw new Error("Missing roles filter bar");
    }

    const typeFilter = within(filterBar).getByRole("button", {
      name: "Type",
    });

    const controls = Array.from(
      filterBar.querySelectorAll('input[name="table-filter"], button')
    );

    expect(filterBar.className).toContain("justify-start");
    expect(controls[0]).toBe(search);
    expect(controls[1]).toBe(typeFilter);
  });

  test("hides built-in roles from the access map until that filter is enabled", async () => {
    const user = userEvent.setup();

    render(<InstanceRolesPage instanceId="prod" tab="map" />);

    const canvas = await screen.findByLabelText("Role access flow canvas");
    expect(canvas.textContent).toContain("role:app_user");
    expect(canvas.textContent).toContain("role:app_group");
    expect(canvas.textContent).toContain("role:replicator");
    expect(canvas.textContent).toContain("role:postgres");
    expect(canvas.textContent).not.toContain("role:pg_read_all_data");

    const controls = screen.getByLabelText("Role access canvas controls");
    expect(
      within(controls).getByRole("button", { name: "Switch to vertical" })
    ).toBeTruthy();
    expect(
      within(controls).getByRole("button", { name: "Resource filters" })
    ).toBeTruthy();
    expect(
      within(controls).getByRole("button", { name: "Expand role access map" })
    ).toBeTruthy();

    await user.click(
      within(controls).getByRole("button", { name: "Resource filters" })
    );
    const builtinSwitch = screen.getByRole("switch", { name: "Built-in" });
    expect(builtinSwitch.getAttribute("aria-checked")).toBe("false");

    await user.click(builtinSwitch);

    await waitFor(() => {
      expect(canvas.textContent).toContain("role:pg_read_all_data");
    });
  });
});
