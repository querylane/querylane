import {
  cleanup,
  render,
  screen,
  waitFor,
  within,
} from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, describe, expect, test, vi } from "vitest";
import { DatabaseStructureMap } from "@/features/database-visualization/database-structure-map";

vi.mock("@tanstack/react-router", () => ({
  useNavigate: () => vi.fn(),
}));

vi.mock("@/features/database-visualization/flow-canvas", () => ({
  FlowCanvas: ({
    actionPanel,
    nodes,
    selectedNodeId,
  }: {
    actionPanel?: React.ReactNode | undefined;
    nodes: { id: string }[];
    selectedNodeId?: string | null | undefined;
  }) => (
    <section aria-label="Flow canvas mock">
      <fieldset aria-label="Canvas map controls">{actionPanel}</fieldset>
      Selected node {selectedNodeId ?? "none"}
      <span>Node ids {nodes.map((node) => node.id).join(",")}</span>
    </section>
  ),
}));

vi.mock("@/features/database-visualization/structure-map-data", () => ({
  useStructureMapData: () => ({
    error: null,
    hasPartialData: false,
    inspectedTableCount: 1,
    isLoading: false,
    schemas: [{ id: "public", name: "public", owner: "app" }],
    tableCount: 1,
    tables: [
      {
        columns: [
          {
            columnName: "id",
            isNullable: false,
            isPrimaryKey: true,
            rawType: "uuid",
          },
        ],
        constraints: [
          {
            columnNames: ["id"],
            constraintName: "accounts_pkey",
            referencedColumnNames: [],
            referencedTable: "",
            type: "primary_key",
          },
          {
            columnNames: ["id"],
            constraintName: "accounts_id_check",
            referencedColumnNames: [],
            referencedTable: "",
            type: "check",
          },
        ],
        indexes: [
          {
            indexName: "accounts_id_idx",
            isUnique: true,
            keyColumns: ["id"],
            method: "btree",
          },
        ],
        policies: [
          {
            command: "SELECT",
            policyName: "accounts_select",
            roles: ["app_user"],
          },
        ],
        schemaName: "public",
        tableName: "accounts",
        triggers: [
          {
            enabled: true,
            events: ["INSERT"],
            functionName: "sync_accounts",
            timing: "BEFORE",
            triggerName: "accounts_sync",
          },
        ],
      },
      {
        columns: [],
        constraints: [],
        indexes: [],
        policies: [],
        schemaName: "public",
        tableName: "audit_log",
        triggers: [],
      },
    ],
    truncatedReason: null,
    views: [
      {
        comment: "",
        owner: "app",
        schemaName: "public",
        viewName: "active_accounts",
        viewType: "standard",
      },
    ],
  }),
}));

afterEach(() => {
  cleanup();
  vi.clearAllMocks();
});

describe("DatabaseStructureMap", () => {
  test("renders map actions inside the canvas and removes the client side badge", async () => {
    render(
      <DatabaseStructureMap
        activeSchemaName="public"
        databaseId="postgres"
        databaseLabel="postgres"
        instanceId="local-dev"
      />
    );

    expect(screen.queryByText("Client side")).toBeNull();
    const canvasControls = await screen.findByLabelText("Canvas map controls");
    expect(
      within(canvasControls).getByRole("button", {
        name: "Switch to vertical",
      })
    ).toBeTruthy();
    const currentSchemaButton = within(canvasControls).getByRole("button", {
      name: "Current schema",
    });
    const fullMapButton = within(canvasControls).getByRole("button", {
      name: "Full map",
    });
    expect(currentSchemaButton).toHaveProperty("disabled", false);
    expect(currentSchemaButton.getAttribute("aria-pressed")).toBe("true");
    expect(fullMapButton).toHaveProperty("disabled", false);
    expect(fullMapButton.getAttribute("aria-pressed")).toBe("false");
    expect(
      within(canvasControls).getByRole("button", {
        name: "Expand database map",
      })
    ).toBeTruthy();
  });

  test("opens an expanded map canvas from the canvas controls", async () => {
    const user = userEvent.setup();

    render(
      <DatabaseStructureMap
        activeSchemaName="public"
        databaseId="postgres"
        databaseLabel="postgres"
        instanceId="local-dev"
      />
    );

    await user.click(
      screen.getByRole("button", { name: "Expand database map" })
    );

    expect(
      screen.getByRole("dialog", { name: "Expanded database map" })
    ).toBeTruthy();
    expect(screen.getAllByLabelText("Flow canvas mock")).toHaveLength(2);
  });

  test("keeps layout direction local to the mounted map", async () => {
    const user = userEvent.setup();
    const firstRender = render(
      <DatabaseStructureMap
        activeSchemaName="public"
        databaseId="postgres"
        databaseLabel="postgres"
        instanceId="local-dev"
      />
    );

    await user.click(
      screen.getByRole("button", { name: "Switch to vertical" })
    );
    expect(
      screen.getByRole("button", { name: "Switch to horizontal" })
    ).toBeTruthy();

    firstRender.unmount();
    render(
      <DatabaseStructureMap
        activeSchemaName="public"
        databaseId="postgres"
        databaseLabel="postgres"
        instanceId="local-dev"
      />
    );

    expect(
      screen.getByRole("button", { name: "Switch to vertical" })
    ).toBeTruthy();
  });

  test("syncs the selected canvas node when the explorer target changes", async () => {
    const { rerender } = render(
      <DatabaseStructureMap
        activeSchemaName="public"
        databaseId="postgres"
        databaseLabel="postgres"
        instanceId="local-dev"
        targetResource={{
          category: "tables",
          name: "accounts",
          schemaName: "public",
        }}
      />
    );

    await waitFor(() => {
      expect(screen.getByLabelText("Flow canvas mock").textContent).toContain(
        "Selected node table:public.accounts"
      );
    });
    expect(screen.getByLabelText("Flow canvas mock").textContent).not.toContain(
      "table:public.audit_log"
    );

    rerender(
      <DatabaseStructureMap
        activeSchemaName="public"
        databaseId="postgres"
        databaseLabel="postgres"
        instanceId="local-dev"
        targetResource={{
          category: "views",
          name: "active_accounts",
          schemaName: "public",
        }}
      />
    );

    await waitFor(() => {
      expect(screen.getByLabelText("Flow canvas mock").textContent).toContain(
        "Selected node view:public.active_accounts"
      );
    });
  });

  test("focuses the selected table instead of rendering every schema table", async () => {
    render(
      <DatabaseStructureMap
        activeSchemaName="public"
        databaseId="postgres"
        databaseLabel="postgres"
        instanceId="local-dev"
        targetResource={{
          category: "tables",
          name: "accounts",
          schemaName: "public",
        }}
      />
    );

    await waitFor(() => {
      expect(screen.getByLabelText("Flow canvas mock").textContent).toContain(
        "table:public.accounts"
      );
    });
    expect(screen.getByLabelText("Flow canvas mock").textContent).not.toContain(
      "table:public.audit_log"
    );
  });

  test("lets current schema exit selected table focus", async () => {
    const user = userEvent.setup();

    render(
      <DatabaseStructureMap
        activeSchemaName="public"
        databaseId="postgres"
        databaseLabel="postgres"
        instanceId="local-dev"
        targetResource={{
          category: "tables",
          name: "accounts",
          schemaName: "public",
        }}
      />
    );

    await waitFor(() => {
      expect(
        screen.getByLabelText("Flow canvas mock").textContent
      ).not.toContain("table:public.audit_log");
    });

    await user.click(screen.getByRole("button", { name: "Resource filters" }));
    await user.click(screen.getByRole("switch", { name: "Tables" }));

    expect(screen.getByLabelText("Flow canvas mock").textContent).toContain(
      "table:public.accounts"
    );
    expect(screen.getByLabelText("Flow canvas mock").textContent).not.toContain(
      "table:public.audit_log"
    );

    await user.click(screen.getByRole("button", { name: "Current schema" }));

    expect(screen.getByLabelText("Flow canvas mock").textContent).toContain(
      "table:public.audit_log"
    );
  });

  test("shows only default resource node types until users enable more", async () => {
    const user = userEvent.setup();

    render(
      <DatabaseStructureMap
        activeSchemaName="public"
        databaseId="postgres"
        databaseLabel="postgres"
        instanceId="local-dev"
      />
    );

    const canvas = await screen.findByLabelText("Flow canvas mock");
    expect(canvas.textContent).toContain("schema:public");
    expect(canvas.textContent).toContain(
      "constraint:public.accounts.accounts_id_check"
    );
    expect(canvas.textContent).toContain(
      "policy:public.accounts.accounts_select"
    );
    expect(canvas.textContent).toContain(
      "trigger:public.accounts.accounts_sync"
    );
    expect(canvas.textContent).not.toContain("column:public.accounts.id");
    expect(canvas.textContent).not.toContain("table:public.accounts");
    expect(canvas.textContent).not.toContain("view:public.active_accounts");

    await user.click(screen.getByRole("button", { name: "Resource filters" }));
    await user.click(screen.getByRole("switch", { name: "Tables" }));

    expect(canvas.textContent).toContain("table:public.accounts");
  });
});
