import { create } from "@bufbuild/protobuf";
import { cleanup, render, screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, describe, expect, it, vi } from "vitest";

import { SchemaDetail } from "@/features/data-explorer/explorer-schema-detail";
import { TableSchema } from "@/protogen/querylane/console/v1alpha1/table_pb";
import {
  View_ViewType,
  ViewSchema,
} from "@/protogen/querylane/console/v1alpha1/view_pb";

const NO_OBJECTS_RE = /No objects/i;
const KIND_FILTER_RE = /^Kind$/;
const OWNER_FILTER_RE = /^Owner$/;

const schemaTables = [
  create(TableSchema, {
    displayName: "audit_log",
    name: "audit_log",
    owner: "admin",
    rowCount: 1_500n,
    sizeBytes: 1024n,
  }),
  create(TableSchema, {
    displayName: "accounts",
    name: "accounts",
    owner: "app_owner",
    rowCount: 42n,
    sizeBytes: 2048n,
  }),
  create(TableSchema, {
    displayName: "events",
    name: "events",
    owner: "app_owner",
    rowCount: -1n,
    sizeBytes: 512n,
  }),
];
const schemaViews = [
  create(ViewSchema, {
    displayName: "active_accounts",
    name: "active_accounts",
    owner: "app_owner",
    rowCount: 20n,
    sizeBytes: 256n,
    viewType: View_ViewType.STANDARD,
  }),
  create(ViewSchema, {
    displayName: "daily_rollups",
    name: "daily_rollups",
    owner: "analytics_owner",
    rowCount: 5n,
    sizeBytes: 4096n,
    viewType: View_ViewType.MATERIALIZED,
  }),
];

afterEach(() => cleanup());

describe("schema detail integration", () => {
  it("summarizes schema metadata and normalizes unknown row counts", () => {
    render(
      <SchemaDetail
        onSelectTable={vi.fn()}
        onSelectView={vi.fn()}
        owner="app_owner"
        schemaName="public"
        tables={schemaTables}
        tablesError={null}
        tablesLoading={false}
        views={schemaViews}
        viewsError={null}
        viewsLoading={false}
      />
    );

    expect(screen.getByRole("heading", { name: "public" })).toBeTruthy();
    expect(screen.getByText("owner: app_owner")).toBeTruthy();
    // Header stats: Tables=3, Views=2, total size 3.5 KB, estimated rows 1.5k.
    expect(screen.getByText("3")).toBeTruthy();
    expect(screen.getByText("7.8 KB")).toBeTruthy();
    expect(screen.getAllByText("1.5k").length).toBeGreaterThan(0);
    // All objects render in the unified inventory table.
    expect(screen.getByText("audit_log")).toBeTruthy();
    expect(screen.getByText("active_accounts")).toBeTruthy();
  });

  it("uses kind and owner filters instead of object facet tabs", () => {
    render(
      <SchemaDetail
        onSelectTable={vi.fn()}
        onSelectView={vi.fn()}
        owner="app_owner"
        schemaName="public"
        tables={schemaTables}
        tablesError={null}
        tablesLoading={false}
        views={schemaViews}
        viewsError={null}
        viewsLoading={false}
      />
    );

    expect(screen.queryByRole("tablist")).toBeNull();
    expect(screen.getByRole("button", { name: KIND_FILTER_RE })).toBeTruthy();
    expect(screen.getByRole("button", { name: OWNER_FILTER_RE })).toBeTruthy();
  });

  it("opens the selected table from the inventory table", async () => {
    const user = userEvent.setup();
    const onSelectTable = vi.fn();

    render(
      <SchemaDetail
        onSelectTable={onSelectTable}
        onSelectView={vi.fn()}
        owner="app_owner"
        schemaName="public"
        tables={schemaTables}
        tablesError={null}
        tablesLoading={false}
        views={schemaViews}
        viewsError={null}
        viewsLoading={false}
      />
    );

    await user.click(screen.getByText("accounts"));

    expect(onSelectTable).toHaveBeenCalledWith("accounts");
  });

  it("filters the inventory by kind", async () => {
    const user = userEvent.setup();

    render(
      <SchemaDetail
        onSelectTable={vi.fn()}
        onSelectView={vi.fn()}
        owner="app_owner"
        schemaName="public"
        tables={schemaTables}
        tablesError={null}
        tablesLoading={false}
        views={schemaViews}
        viewsError={null}
        viewsLoading={false}
      />
    );

    await user.click(screen.getByRole("button", { name: KIND_FILTER_RE }));
    const viewOptions = screen.getAllByText("Views");
    const viewOption = viewOptions.at(-1);
    if (!viewOption) {
      throw new Error("Missing Views filter option");
    }
    await user.click(viewOption);

    expect(screen.getByText("active_accounts")).toBeTruthy();
    expect(screen.queryByText("audit_log")).toBeNull();
  });

  it("filters the inventory by owner", async () => {
    const user = userEvent.setup();

    render(
      <SchemaDetail
        onSelectTable={vi.fn()}
        onSelectView={vi.fn()}
        owner="app_owner"
        schemaName="public"
        tables={schemaTables}
        tablesError={null}
        tablesLoading={false}
        views={schemaViews}
        viewsError={null}
        viewsLoading={false}
      />
    );

    await user.click(screen.getByRole("button", { name: OWNER_FILTER_RE }));
    const ownerOptions = screen.getAllByText("analytics_owner");
    const ownerOption = ownerOptions.at(-1);
    if (!ownerOption) {
      throw new Error("Missing analytics_owner filter option");
    }
    await user.click(ownerOption);

    expect(screen.getByText("daily_rollups")).toBeTruthy();
    expect(screen.queryByText("accounts")).toBeNull();
    expect(screen.queryByText("active_accounts")).toBeNull();
  });

  it("resets local schema overview facets without leaving the schema", async () => {
    const user = userEvent.setup();

    render(
      <SchemaDetail
        onSelectTable={vi.fn()}
        onSelectView={vi.fn()}
        owner="app_owner"
        schemaName="public"
        tables={schemaTables}
        tablesError={null}
        tablesLoading={false}
        views={schemaViews}
        viewsError={null}
        viewsLoading={false}
      />
    );

    await user.click(screen.getByRole("button", { name: KIND_FILTER_RE }));
    await user.click(
      screen.getByRole("option", { name: "Materialized views" })
    );
    await user.click(screen.getByRole("button", { name: OWNER_FILTER_RE }));
    await user.click(screen.getByRole("option", { name: "analytics_owner" }));
    expect(screen.getByText("daily_rollups")).toBeTruthy();
    expect(screen.queryByText("audit_log")).toBeNull();

    await user.click(screen.getByRole("button", { name: "Reset" }));

    expect(screen.getByRole("heading", { name: "public" })).toBeTruthy();
    expect(screen.getByText("audit_log")).toBeTruthy();
    expect(screen.getByText("active_accounts")).toBeTruthy();
  });

  it("opens the selected view from the inventory table", async () => {
    const user = userEvent.setup();
    const onSelectView = vi.fn();

    render(
      <SchemaDetail
        onSelectTable={vi.fn()}
        onSelectView={onSelectView}
        owner="app_owner"
        schemaName="public"
        tables={schemaTables}
        tablesError={null}
        tablesLoading={false}
        views={schemaViews}
        viewsError={null}
        viewsLoading={false}
      />
    );

    await user.click(screen.getByText("active_accounts"));

    expect(onSelectView).toHaveBeenCalledWith("active_accounts");
  });

  it("marks header stats as lower bounds when the catalog is paginated", () => {
    render(
      <SchemaDetail
        hasMoreTables={true}
        hasMoreViews={true}
        onSelectTable={vi.fn()}
        onSelectView={vi.fn()}
        owner="app_owner"
        schemaName="public"
        tables={schemaTables}
        tablesError={null}
        tablesLoading={false}
        views={schemaViews}
        viewsError={null}
        viewsLoading={false}
      />
    );

    // Counts and totals only cover the loaded pages, so they read as
    // "at least" rather than exact values.
    expect(screen.getByText("3+")).toBeTruthy();
    expect(screen.getByText("2+")).toBeTruthy();
    expect(screen.getByText("≥ 7.8 KB")).toBeTruthy();
    expect(screen.getByText("≥ 1.5k")).toBeTruthy();
  });

  it("renders a loading state while the first table page is pending", () => {
    render(
      <SchemaDetail
        onSelectTable={vi.fn()}
        onSelectView={vi.fn()}
        owner=""
        schemaName="archive"
        tables={[]}
        tablesError={null}
        tablesLoading={true}
        views={[]}
        viewsError={null}
        viewsLoading={true}
      />
    );

    expect(
      screen.getByRole("status", { name: "Loading objects" })
    ).toBeTruthy();
  });

  it("shows the shared empty state when the schema has no objects", () => {
    render(
      <SchemaDetail
        onSelectTable={vi.fn()}
        onSelectView={vi.fn()}
        owner=""
        schemaName="archive"
        tables={[]}
        tablesError={null}
        tablesLoading={false}
        views={[]}
        viewsError={null}
        viewsLoading={false}
      />
    );

    const inventoryTable = screen.getByRole("table");
    expect(within(inventoryTable).getByText(NO_OBJECTS_RE)).toBeTruthy();
  });

  it("marks catalog sync warnings as alerts", () => {
    render(
      <SchemaDetail
        onSelectTable={vi.fn()}
        onSelectView={vi.fn()}
        owner="app_owner"
        schemaName="public"
        tables={schemaTables}
        tablesError={null}
        tablesLoading={false}
        tablesSyncNotice={{
          message: "Showing cached catalog. Refresh failed.",
          tone: "warning",
        }}
        views={schemaViews}
        viewsError={null}
        viewsLoading={false}
      />
    );

    expect(screen.getByRole("alert").textContent).toContain(
      "Showing cached catalog. Refresh failed."
    );
  });
});
