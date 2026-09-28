import { create } from "@bufbuild/protobuf";
import type { ServiceImpl } from "@connectrpc/connect";
import { page } from "@rstest/browser";
import { render } from "@rstest/browser-react";
import { expect, rs, test } from "@rstest/core";
import * as actualRouter from "@tanstack/react-router" with {
  rstest: "importActual",
};
import { screen } from "@testing-library/dom";
import { ScreenshotFrame } from "@/__tests__/browser-test-utils";
import { ExplorerRailFrame } from "@/__tests__/explorer-rail-test-utils";
import { DataExplorerPage } from "@/features/data-explorer/data-explorer-page";
import type { DataExplorerSearch } from "@/features/data-explorer/data-explorer-route-search";
import {
  GetSchemaResponseSchema,
  ListSchemasResponseSchema,
  SchemaService,
} from "@/protogen/querylane/console/v1alpha1/schema_pb";
import {
  GetTableResponseSchema,
  ListTableColumnsResponseSchema,
  ListTableConstraintsResponseSchema,
  ListTablesResponseSchema,
  TableSchema,
  TableService,
} from "@/protogen/querylane/console/v1alpha1/table_pb";
import {
  ListViewsResponseSchema,
  ViewService,
} from "@/protogen/querylane/console/v1alpha1/view_pb";
import { schemaLoadErrorServices } from "@/test/fixtures/explorer-states-fixtures";
import { createTestRouterTransport } from "@/test/router-transport";
import { HarnessProviders } from "@/visual-harness/harness-providers";

// The grid has its own browser coverage; a fixed stand-in keeps these layout
// measurements independent of row data.
rs.mock("@/components/data-grid/table-data-grid/table-data-grid", () => {
  const tableDataGridExportName = "TableDataGrid";
  return {
    [tableDataGridExportName]: ({
      children,
    }: {
      children?: (state: {
        grid: React.ReactNode;
        lastFetchedLabel: string;
      }) => React.ReactNode;
    }) => {
      const grid = (
        <div
          className="h-64 w-full rounded-lg border border-border bg-muted/20"
          data-testid="mock-table-data-grid"
        />
      );

      return children
        ? children({ grid, lastFetchedLabel: "Last fetched 12:00:00 AM" })
        : grid;
    },
  };
});

rs.mock("@tanstack/react-router", () => {
  const linkExportName = "Link";
  return {
    ...actualRouter,
    [linkExportName]: ({ children }: { children: React.ReactNode }) => (
      <a href="/explorer">{children}</a>
    ),
    useNavigate: () => rs.fn(),
  };
});

rs.mock("@/components/querylane-ui/sidebar", () => ({
  useSidebar: () => ({ isMobile: false, setOpenMobile: rs.fn() }),
}));

rs.mock("@/lib/db-context", () => ({
  useDb: () => ({ selectedDatabase: { name: "appdb" } }),
}));

interface ExplorerServices {
  schema: Partial<ServiceImpl<typeof SchemaService>>;
  table: Partial<ServiceImpl<typeof TableService>>;
  view?: Partial<ServiceImpl<typeof ViewService>>;
}

const ANALYTICS_SCHEMA = {
  displayName: "analytics",
  name: "instances/prod/databases/app/schemas/analytics",
  owner: "postgres",
};
const PAGE_VIEWS_TABLE = create(TableSchema, {
  displayName: "page_views",
  name: "instances/prod/databases/app/schemas/analytics/tables/page_views",
  rowCount: 42n,
  sizeBytes: 65_536n,
});

function analyticsCatalogServices(): Required<ExplorerServices> {
  return {
    schema: {
      getSchema: () =>
        create(GetSchemaResponseSchema, { schema: ANALYTICS_SCHEMA }),
      listSchemas: () =>
        create(ListSchemasResponseSchema, { schemas: [ANALYTICS_SCHEMA] }),
    },
    table: {
      getTable: () =>
        create(GetTableResponseSchema, { table: PAGE_VIEWS_TABLE }),
      listTableColumns: () => create(ListTableColumnsResponseSchema),
      listTableConstraints: () => create(ListTableConstraintsResponseSchema),
      listTables: () =>
        create(ListTablesResponseSchema, { tables: [PAGE_VIEWS_TABLE] }),
    },
    view: { listViews: () => create(ListViewsResponseSchema) },
  };
}

function renderExplorerPage({
  search = {},
  services,
  width,
}: {
  search?: DataExplorerSearch;
  services: ExplorerServices;
  width: "w-[1180px]" | "w-[1800px]";
}) {
  const transport = createTestRouterTransport((router) => {
    router.service(SchemaService, services.schema);
    router.service(TableService, services.table);
    router.service(ViewService, services.view ?? {});
  });

  return render(
    <HarnessProviders transport={transport}>
      <ScreenshotFrame>
        <div
          className={`h-[720px] ${width} overflow-hidden rounded-2xl border border-border bg-background text-foreground`}
          data-testid="explorer-shell"
        >
          <ExplorerRailFrame>
            <DataExplorerPage
              databaseId="app"
              instanceId="prod"
              search={search}
            />
          </ExplorerRailFrame>
        </div>
      </ScreenshotFrame>
    </HarnessProviders>
  );
}

test("data explorer schema load failures stay visibly retryable", async () => {
  await renderExplorerPage({
    services: schemaLoadErrorServices(),
    width: "w-[1180px]",
  });

  await expect
    .element(page.getByRole("button", { name: "Retry" }))
    .toBeVisible();
  await expect
    .element(page.getByRole("button", { name: "Error details" }))
    .toBeVisible();
  await expect.element(page.getByText("No schemas")).not.toBeAttached();
});

test("data explorer table grid uses width immediately beside object browser", async () => {
  await renderExplorerPage({
    search: { category: "tables", name: "page_views", schema: "analytics" },
    services: analyticsCatalogServices(),
    width: "w-[1800px]",
  });

  await expect.element(page.getByTestId("mock-table-data-grid")).toBeVisible();

  const shell = document.querySelector("[data-testid='explorer-shell']");
  const rail = document.querySelector("[data-testid='explorer-rail-slot']");
  const sidebar = document.querySelector(
    "aside[aria-label='Database objects']"
  );
  const grid = document.querySelector("[data-testid='mock-table-data-grid']");
  const tabsList = document.querySelector("[data-slot='tabs-list']");
  if (!(shell && rail && sidebar && grid && tabsList)) {
    throw new Error("Expected explorer shell, rail, sidebar, tabs, and grid.");
  }

  // The object browser portals into the fixed-width rail; no drag handle.
  expect(rail.contains(sidebar)).toBe(true);
  expect(document.querySelector("[data-slot='resizable-handle']")).toBeNull();

  const shellRect = shell.getBoundingClientRect();
  const railRect = rail.getBoundingClientRect();
  const sidebarRect = sidebar.getBoundingClientRect();
  const gridRect = grid.getBoundingClientRect();
  const tabsListRect = tabsList.getBoundingClientRect();
  const gapBetweenRailAndGrid = gridRect.left - railRect.right;
  const unusedRightSpace = shellRect.right - gridRect.right;

  expect(sidebarRect.width).toBeGreaterThanOrEqual(railRect.width - 2);
  expect(tabsListRect.left).toBeGreaterThanOrEqual(railRect.right - 1);
  expect(gridRect.left).toBeGreaterThanOrEqual(railRect.right - 1);
  expect(gapBetweenRailAndGrid).toBeLessThanOrEqual(64);
  expect(unusedRightSpace).toBeLessThanOrEqual(64);

  const filterInput = sidebar.querySelector("[data-slot='input']");
  const schemaNode = Array.from(sidebar.querySelectorAll("button")).find(
    (button) => button.textContent?.includes("analytics")
  );
  if (
    !(filterInput instanceof HTMLElement && schemaNode instanceof HTMLElement)
  ) {
    throw new Error("Expected schema tree node and filter input.");
  }
  // The active schema renders as an expanded tree node with its objects
  // nested underneath.
  expect(schemaNode.getAttribute("aria-expanded")).toBe("true");

  const tableButton = Array.from(sidebar.querySelectorAll("button")).find(
    (button) => button.textContent?.includes("page_views")
  );
  const tableName = tableButton?.querySelector(".min-w-0.flex-1");
  const sizeLabel = Array.from(sidebar.querySelectorAll("span")).find(
    (element) => element.textContent?.trim() === "64 KB"
  );
  if (
    !(
      tableButton instanceof HTMLElement &&
      tableName instanceof HTMLElement &&
      sizeLabel instanceof HTMLElement
    )
  ) {
    throw new Error("Expected table resource row, name, and size label.");
  }
  const tableNameRect = tableName.getBoundingClientRect();
  const sizeLabelRect = sizeLabel.getBoundingClientRect();
  expect(tableNameRect.width).toBeGreaterThan(80);
  expect(sizeLabelRect.right).toBeLessThanOrEqual(
    sidebar.getBoundingClientRect().right
  );
  expect(sizeLabelRect.left).toBeGreaterThanOrEqual(tableNameRect.right - 1);
});

test("data explorer schema map fills the available detail area", async () => {
  await renderExplorerPage({
    search: { schema: "analytics", tab: "map" },
    services: analyticsCatalogServices(),
    width: "w-[1800px]",
  });

  await expect
    .element(page.getByRole("region", { name: "Schema map for analytics" }))
    .toBeVisible();

  const shell = screen.getByTestId("explorer-shell");
  const rail = screen.getByTestId("explorer-rail-slot");
  const map = screen.getByRole("region", { name: "Schema map for analytics" });
  const canvas = screen.getByRole("region", {
    name: "Schema relationship map",
  });
  const shellRect = shell.getBoundingClientRect();
  const railRect = rail.getBoundingClientRect();
  const mapRect = map.getBoundingClientRect();
  const canvasRect = canvas.getBoundingClientRect();

  expect(mapRect.width).toBeGreaterThan(1200);
  expect(mapRect.left).toBeGreaterThanOrEqual(railRect.right);
  expect(mapRect.left - railRect.right).toBeLessThanOrEqual(64);
  expect(mapRect.right).toBeLessThanOrEqual(shellRect.right);
  expect(shellRect.right - mapRect.right).toBeLessThanOrEqual(64);
  expect(mapRect.bottom).toBeLessThanOrEqual(shellRect.bottom);
  expect(shellRect.bottom - mapRect.bottom).toBeLessThanOrEqual(64);
  expect(canvasRect.bottom).toBeLessThanOrEqual(mapRect.bottom);
});

test("data explorer schema objects fill the pane at wide widths", async () => {
  await renderExplorerPage({
    search: { schema: "analytics" },
    services: analyticsCatalogServices(),
    width: "w-[1800px]",
  });

  await expect
    .element(page.getByRole("heading", { name: "analytics" }))
    .toBeVisible();

  const details = screen.getByRole("region", {
    name: "Data Explorer details",
  });
  const content = details.firstElementChild?.firstElementChild;
  if (!(content instanceof HTMLElement)) {
    throw new Error("Expected the Data Explorer detail content.");
  }

  // Full-bleed layout: the detail content spans the whole pane instead of
  // the old centered max-w-[900px] column.
  const detailsRect = details.getBoundingClientRect();
  const contentRect = content.getBoundingClientRect();

  expect(contentRect.width).toBeGreaterThan(900);
  expect(Math.abs(contentRect.left - detailsRect.left)).toBeLessThanOrEqual(1);
  expect(Math.abs(contentRect.right - detailsRect.right)).toBeLessThanOrEqual(
    1
  );
});
