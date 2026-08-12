import { afterEach, describe, expect, it, rs } from "@rstest/core";
import { act, cleanup, render, screen, waitFor } from "@testing-library/react";

const TABLE_DETAIL_EXPORT = "TableDetail";
const VIEW_DETAIL_EXPORT = "ViewDetail";

afterEach(() => {
  cleanup();
  rs.doUnmock("@/features/data-explorer/explorer-table-detail");
  rs.doUnmock("@/features/data-explorer/explorer-view-detail");
});

describe("ResourceDetail", () => {
  it("does not load table detail code for view resources", async () => {
    let loadedTableDetail = false;
    rs.doMock("@/features/data-explorer/explorer-table-detail", () => {
      loadedTableDetail = true;
      return {
        [TABLE_DETAIL_EXPORT]: () => <div>Table detail</div>,
      };
    });
    rs.doMock("@/features/data-explorer/explorer-view-detail", () => ({
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
        onTableTabChange={rs.fn()}
        schemaName="public"
        table={undefined}
        tableTab={undefined}
        view={undefined}
      />
    );

    screen.getByText("View detail: active_users");
    expect(loadedTableDetail).toBe(false);
  });
  it("paints the selected table heading while table detail suspends", async () => {
    let tableDetailLoaded = false;
    let resolveTableDetail: (() => void) | undefined;
    const tableDetailLoading = new Promise<void>((resolve) => {
      resolveTableDetail = () => {
        tableDetailLoaded = true;
        resolve();
      };
    });
    rs.doMock("@/features/data-explorer/explorer-table-detail", () => ({
      [TABLE_DETAIL_EXPORT]: () => {
        if (!tableDetailLoaded) {
          throw tableDetailLoading;
        }
        return <div>Table detail loaded</div>;
      },
    }));
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
        onTableTabChange={rs.fn()}
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
    await act(() => {
      resolveTableDetail?.();
      return tableDetailLoading;
    });
    await screen.findByText("Table detail loaded");
  }, 20_000);
});
