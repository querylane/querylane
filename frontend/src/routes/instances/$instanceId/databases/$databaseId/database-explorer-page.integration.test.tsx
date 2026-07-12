import { cleanup, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it } from "vitest";
import {
  ExplorerSidebarSlotProvider,
  useExplorerSidebarSlotRegistration,
} from "@/lib/explorer-sidebar-slot";
import { DatabaseExplorerLoadingShell } from "@/routes/instances/$instanceId/databases/$databaseId/database-explorer-page";
import { shouldPreloadTableDetail } from "@/routes/instances/$instanceId/databases/$databaseId/database-explorer-preload";
import { Route as DatabaseExplorerRoute } from "@/routes/instances/$instanceId/databases/$databaseId/explorer";

afterEach(() => cleanup());

function ExplorerRailSlotTarget() {
  const registerSlotTarget = useExplorerSidebarSlotRegistration();
  return <div data-testid="explorer-rail-slot" ref={registerSlotTarget} />;
}

describe("DatabaseExplorerLoadingShell", () => {
  it("matches the data explorer shell during lazy loading", () => {
    render(
      <ExplorerSidebarSlotProvider>
        <ExplorerRailSlotTarget />
        <DatabaseExplorerLoadingShell />
      </ExplorerSidebarSlotProvider>
    );

    expect(screen.getByTestId("explorer-rail-slot").textContent).toContain(
      "Loading schemas…"
    );
    expect(screen.getByText("Preparing data explorer…")).toBeTruthy();
    expect(screen.getByTestId("branded-loading-state")).toBeTruthy();
  });

  it("renders the detail loading state without a rail slot mounted", () => {
    render(<DatabaseExplorerLoadingShell />);

    expect(screen.queryByText("Loading schemas…")).toBeNull();
    expect(screen.getByText("Preparing data explorer…")).toBeTruthy();
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
