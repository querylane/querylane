import { cleanup, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it } from "vitest";
import { DatabaseExplorerLoadingShell } from "@/routes/instances/$instanceId/databases/$databaseId/database-explorer-page";
import { shouldPreloadTableDetail } from "@/routes/instances/$instanceId/databases/$databaseId/database-explorer-preload";
import { Route as DatabaseExplorerRoute } from "@/routes/instances/$instanceId/databases/$databaseId/explorer";

afterEach(() => cleanup());

describe("DatabaseExplorerLoadingShell", () => {
  it("matches the data explorer shell during lazy loading", () => {
    render(<DatabaseExplorerLoadingShell />);

    expect(
      screen.getByRole("complementary", { name: "Database objects" })
    ).toBeTruthy();
    expect(screen.getByText("Loading schemas…")).toBeTruthy();
    expect(screen.getByText("Preparing data explorer…")).toBeTruthy();
    expect(screen.getByTestId("branded-loading-state")).toBeTruthy();
  });

  it("lets app-level navigation progress handle route data transitions", () => {
    expect(DatabaseExplorerRoute.options.pendingComponent).toBeUndefined();
    expect(DatabaseExplorerRoute.options.pendingMs).toBeUndefined();
  });
  it("preloads table detail code for selected table deep links", () => {
    expect(
      shouldPreloadTableDetail({
        category: "tables",
        name: "orders",
        schema: "public",
      })
    ).toBe(true);
    expect(
      shouldPreloadTableDetail({
        category: "views",
        name: "active_accounts",
        schema: "public",
      })
    ).toBe(false);
    expect(shouldPreloadTableDetail({ category: "tables" })).toBe(false);
  });
});
