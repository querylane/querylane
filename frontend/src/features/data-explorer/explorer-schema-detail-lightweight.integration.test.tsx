import { create } from "@bufbuild/protobuf";
import { cleanup, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";

import { TableSchema } from "@/protogen/querylane/console/v1alpha1/table_pb";
import {
  View_ViewType,
  ViewSchema,
} from "@/protogen/querylane/console/v1alpha1/view_pb";

const tables = [
  create(TableSchema, {
    displayName: "orders",
    name: "orders",
    rowCount: 42n,
    sizeBytes: 2048n,
  }),
];
const views = [
  create(ViewSchema, {
    displayName: "active_orders",
    name: "active_orders",
    rowCount: 12n,
    sizeBytes: 1024n,
    viewType: View_ViewType.STANDARD,
  }),
];

afterEach(() => {
  cleanup();
  vi.doUnmock("@/components/ui/data-table");
  vi.resetModules();
});

describe("SchemaDetail inventory rendering", () => {
  it("renders the unified inventory through the generic DataTable", async () => {
    let loadedDataTable = false;
    vi.doMock("@/components/ui/data-table", async (importOriginal) => {
      const actual =
        await importOriginal<typeof import("@/components/ui/data-table")>();
      loadedDataTable = true;
      return actual;
    });
    const { SchemaDetail } = await import(
      "@/features/data-explorer/explorer-schema-detail"
    );

    render(
      <SchemaDetail
        onSelectTable={vi.fn()}
        onSelectView={vi.fn()}
        owner="app_owner"
        schemaName="public"
        tables={tables}
        tablesError={null}
        tablesLoading={false}
        views={views}
        viewsError={null}
        viewsLoading={false}
      />
    );

    expect(loadedDataTable).toBe(true);
    expect(screen.getByText("orders")).toBeTruthy();
    expect(screen.getByText("active_orders")).toBeTruthy();
  });

  it("renders both kinds as rows inside the single shared table", async () => {
    const { SchemaDetail } = await import(
      "@/features/data-explorer/explorer-schema-detail"
    );

    render(
      <SchemaDetail
        onSelectTable={vi.fn()}
        onSelectView={vi.fn()}
        owner="app_owner"
        schemaName="public"
        tables={tables}
        tablesError={null}
        tablesLoading={false}
        views={views}
        viewsError={null}
        viewsLoading={false}
      />
    );

    // One unified table with both kinds: one TABLE badge, one VIEW badge.
    expect(screen.getAllByRole("table")).toHaveLength(1);
    expect(screen.getByText("TABLE")).toBeTruthy();
    expect(screen.getByText("VIEW")).toBeTruthy();
  });
});
