import { cleanup, render, screen, waitFor } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";

const TABLE_DETAIL_EXPORT = "TableDetail";
const VIEW_DETAIL_EXPORT = "ViewDetail";
type TableDetailModule = Pick<
  typeof import("@/features/data-explorer/explorer-table-detail"),
  "TableDetail"
>;

afterEach(() => {
  cleanup();
  vi.doUnmock("@/features/data-explorer/explorer-table-detail");
  vi.doUnmock("@/features/data-explorer/explorer-view-detail");
  vi.resetModules();
});

describe("ResourceDetail", () => {
  it("does not load table detail code for view resources", async () => {
    let loadedTableDetail = false;
    vi.doMock("@/features/data-explorer/explorer-table-detail", () => {
      loadedTableDetail = true;
      return {
        [TABLE_DETAIL_EXPORT]: () => <div>Table detail</div>,
      };
    });
    vi.doMock("@/features/data-explorer/explorer-view-detail", () => ({
      [VIEW_DETAIL_EXPORT]: ({ viewName }: { viewName: string }) => (
        <div>View detail: {viewName}</div>
      ),
    }));
    const { ResourceDetail } = await import(
      "@/features/data-explorer/explorer-resource-detail"
    );

    render(
      <ResourceDetail
        category="views"
        databaseId="db"
        instanceId="inst"
        mutationsAllowed={true}
        name="active_users"
        onTableTabChange={vi.fn()}
        schemaName="public"
        table={undefined}
        tableTab={undefined}
        view={undefined}
      />
    );

    screen.getByText("View detail: active_users");
    expect(loadedTableDetail).toBe(false);
  });
  it("paints the selected table heading while table detail code loads", async () => {
    let resolveTableDetail: ((module: TableDetailModule) => void) | undefined;
    vi.doMock(
      "@/features/data-explorer/explorer-table-detail",
      () =>
        new Promise<TableDetailModule>((resolve) => {
          resolveTableDetail = resolve;
        })
    );
    const { ResourceDetail } = await import(
      "@/features/data-explorer/explorer-resource-detail"
    );

    render(
      <ResourceDetail
        category="tables"
        databaseId="db"
        instanceId="inst"
        mutationsAllowed={true}
        name="orders"
        onTableTabChange={vi.fn()}
        schemaName="public"
        table={undefined}
        tableTab={undefined}
        view={undefined}
      />
    );

    expect(screen.getByRole("heading", { name: "public.orders" })).toBeTruthy();
    expect(screen.getByText("Loading table details…")).toBeTruthy();
    await waitFor(() => {
      expect(resolveTableDetail).toBeTypeOf("function");
    });
    resolveTableDetail?.({
      TableDetail: () => <div>Table detail loaded</div>,
    });
    await screen.findByText("Table detail loaded");
  }, 20_000);
});
