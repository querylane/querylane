import { create } from "@bufbuild/protobuf";
import { afterEach, describe, expect, it, rs } from "@rstest/core";
import { cleanup, render, screen } from "@testing-library/react";
import * as dataTableActual from "@/components/ui/data-table" with {
  rstest: "importActual",
};

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
  rs.doUnmock("@/components/ui/data-table");
});

describe("SchemaDetail inventory rendering", () => {
  it("renders the unified inventory through the generic DataTable", async () => {
    let loadedDataTable = false;
    rs.doMock("@/components/ui/data-table", () => {
      loadedDataTable = true;
      return dataTableActual;
    });
    const { SchemaDetail } = await import(
      "@/features/data-explorer/explorer-schema-detail"
    );

    render(
      <SchemaDetail
        onSelectTable={rs.fn()}
        onSelectView={rs.fn()}
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
  }, 20_000);

  it("renders both kinds as rows inside the single shared table", async () => {
    const { SchemaDetail } = await import(
      "@/features/data-explorer/explorer-schema-detail"
    );

    render(
      <SchemaDetail
        onSelectTable={rs.fn()}
        onSelectView={rs.fn()}
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
  }, 20_000);
});
