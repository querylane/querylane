import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { beforeEach, expect, test, vi } from "vitest";
import { KeyboardShortcutsProvider } from "@/components/keyboard-shortcuts";
import {
  CommandPaletteProvider,
  useCommandPalette,
} from "@/components/querylane-ui/admin-command-palette";
import { Button } from "@/components/ui/button";

const navigateMock = vi.fn(() => Promise.resolve());
const commandPaletteMockState = vi.hoisted(() => ({
  catalogQuery: {
    data: {
      objects: [
        {
          kind: "table",
          name: "instances/prod-analytics/databases/customer-events/schemas/public/tables/shipments",
          objectId: "shipments",
          rowCount: 2_400_000n,
          schemaId: "public",
        },
        {
          kind: "view",
          name: "instances/prod-analytics/databases/customer-events/schemas/public/views/active-shipments",
          objectId: "active_shipments",
          rowCount: 0n,
          schemaId: "public",
        },
      ],
    },
    error: null as Error | null,
    isPending: false,
  },
  rolesQuery: {
    data: { roles: [] as Record<string, unknown>[] },
    error: null as Error | null,
    isPending: false,
  },
}));

vi.mock("@tanstack/react-router", () => ({
  useNavigate: () => navigateMock,
}));

vi.mock("@/lib/db-context", () => ({
  useDb: () => ({
    navigationIds: {
      databaseId: "customer-events",
      instanceId: "prod-analytics",
    },
    selectedDatabase: {
      id: "customer-events",
      name: "customer_events",
    },
  }),
}));

vi.mock("@/hooks/api/database-catalog", () => ({
  useDatabaseCatalogQuery: () => commandPaletteMockState.catalogQuery,
}));

vi.mock("@/hooks/api/role", () => ({
  rolesForInstanceQueryInput: (instanceId: string) => ({ instanceId }),
  useListAllRolesQuery: () => commandPaletteMockState.rolesQuery,
}));

beforeEach(() => {
  navigateMock.mockClear();
  commandPaletteMockState.catalogQuery.error = null;
  commandPaletteMockState.catalogQuery.isPending = false;
  commandPaletteMockState.rolesQuery.data.roles = [];
  commandPaletteMockState.rolesQuery.error = null;
  commandPaletteMockState.rolesQuery.isPending = false;
});

function CommandPaletteTrigger() {
  const { openPalette } = useCommandPalette();
  return (
    <Button aria-label="Search or jump to" onClick={openPalette} type="button">
      Search or jump to…
    </Button>
  );
}

function renderAdminCommandPalette() {
  return render(
    <KeyboardShortcutsProvider>
      <CommandPaletteProvider>
        <CommandPaletteTrigger />
      </CommandPaletteProvider>
    </KeyboardShortcutsProvider>
  );
}

test("Cmd+K searches and jumps to a table", async () => {
  const user = userEvent.setup();
  renderAdminCommandPalette();

  await user.keyboard("{Meta>}k{/Meta}");
  await user.type(
    await screen.findByRole("combobox", {
      name: "Search tables, screens, roles, or saved queries",
    }),
    "shipments"
  );
  await user.click(screen.getByText("customer_events.public.shipments"));

  expect(navigateMock).toHaveBeenCalledWith({
    params: {
      databaseId: "customer-events",
      instanceId: "prod-analytics",
    },
    search: {
      category: "tables",
      name: "shipments",
      schema: "public",
    },
    to: "/instances/$instanceId/databases/$databaseId/explorer",
  });
  await waitFor(() => {
    expect(
      screen.queryByRole("dialog", { name: "Search or jump to" })
    ).toBeNull();
  });
});

test("role search jumps to the selected role", async () => {
  commandPaletteMockState.rolesQuery.data.roles = [
    {
      attributes: { canLogin: true },
      isSystemRole: false,
      name: "instances/prod-analytics/roles/app-reader",
      roleName: "app_reader",
    },
  ];
  const user = userEvent.setup();
  renderAdminCommandPalette();

  await user.click(screen.getByRole("button", { name: "Search or jump to" }));
  await user.type(
    await screen.findByRole("combobox", {
      name: "Search tables, screens, roles, or saved queries",
    }),
    "app_reader"
  );
  await user.click(screen.getByText("app_reader"));

  expect(navigateMock).toHaveBeenCalledWith({
    params: {
      instanceId: "prod-analytics",
      roleId: "app-reader",
    },
    to: "/instances/$instanceId/roles/$roleId",
  });
});

test("screen selection jumps to the current database overview", async () => {
  const user = userEvent.setup();
  renderAdminCommandPalette();

  await user.click(screen.getByRole("button", { name: "Search or jump to" }));
  await user.click(await screen.findByText("Overview"));

  expect(navigateMock).toHaveBeenCalledWith(
    expect.objectContaining({
      params: {
        databaseId: "customer-events",
        instanceId: "prod-analytics",
      },
      search: expect.any(Function),
      to: "/instances/$instanceId/databases/$databaseId",
    })
  );
});

test("catalog loading remains visible beside available screen targets", async () => {
  commandPaletteMockState.catalogQuery.isPending = true;
  const user = userEvent.setup();
  renderAdminCommandPalette();

  await user.click(screen.getByRole("button", { name: "Search or jump to" }));

  expect(await screen.findByText("Loading database objects…")).toBeDefined();
  expect(screen.getByText("Overview")).toBeDefined();
});

test("role loading replaces the no-matches state while search resolves", async () => {
  commandPaletteMockState.rolesQuery.isPending = true;
  const user = userEvent.setup();
  renderAdminCommandPalette();

  await user.click(screen.getByRole("button", { name: "Search or jump to" }));
  await user.type(
    await screen.findByRole("combobox", {
      name: "Search tables, screens, roles, or saved queries",
    }),
    "unresolved-role"
  );

  expect(await screen.findByText("Loading roles…")).toBeDefined();
  expect(
    screen.queryByText("No matches — try a table or role name")
  ).toBeNull();
});

test("role errors replace the no-matches state when search cannot resolve", async () => {
  commandPaletteMockState.rolesQuery.error = new Error("roles offline");
  const user = userEvent.setup();
  renderAdminCommandPalette();

  await user.click(screen.getByRole("button", { name: "Search or jump to" }));
  await user.type(
    await screen.findByRole("combobox", {
      name: "Search tables, screens, roles, or saved queries",
    }),
    "unresolved-role"
  );

  expect(await screen.findByText("Could not load roles")).toBeDefined();
  expect(
    screen.queryByText("No matches — try a table or role name")
  ).toBeNull();
});

test("catalog errors remain visible beside available screen targets", async () => {
  commandPaletteMockState.catalogQuery.error = new Error("catalog offline");
  const user = userEvent.setup();
  renderAdminCommandPalette();

  await user.click(screen.getByRole("button", { name: "Search or jump to" }));

  expect(
    await screen.findByText("Could not load database objects")
  ).toBeDefined();
  expect(screen.getByText("Overview")).toBeDefined();
});

test("view selection jumps to the Data Explorer view category", async () => {
  const user = userEvent.setup();
  renderAdminCommandPalette();

  await user.click(screen.getByRole("button", { name: "Search or jump to" }));
  await user.click(
    await screen.findByText("customer_events.public.active_shipments")
  );

  expect(navigateMock).toHaveBeenCalledWith({
    params: {
      databaseId: "customer-events",
      instanceId: "prod-analytics",
    },
    search: {
      category: "views",
      name: "active_shipments",
      schema: "public",
    },
    to: "/instances/$instanceId/databases/$databaseId/explorer",
  });
});
