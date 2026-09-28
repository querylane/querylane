import { create } from "@bufbuild/protobuf";
import type { Transport } from "@connectrpc/connect";
import { page } from "@rstest/browser";
import { render } from "@rstest/browser-react";
import { afterEach, beforeEach, expect, rs, test } from "@rstest/core";
import * as actualRouter from "@tanstack/react-router" with {
  rstest: "importActual",
};
import { screen } from "@testing-library/dom";
import type { ComponentProps, ReactNode } from "react";
import { ScreenshotFrame } from "@/__tests__/browser-test-utils";
import { SchemaDetail } from "@/features/data-explorer/explorer-schema-detail";
import { ExplorerSchemaMap } from "@/features/data-explorer/explorer-schema-map";
import { TableDetail } from "@/features/data-explorer/explorer-table-detail";
import { ViewDetail } from "@/features/data-explorer/explorer-view-detail";
import { catalogSyncNotice } from "@/features/data-explorer/use-data-explorer-state";
import { buildSchemaName } from "@/lib/console-resources";
import * as actualTransport from "@/lib/transport" with {
  rstest: "importActual",
};
import { cn } from "@/lib/utils";
import { CatalogSyncMetadataSchema } from "@/protogen/querylane/console/v1alpha1/catalog_sync_pb";
import { SQLService } from "@/protogen/querylane/console/v1alpha1/sql_pb";
import {
  DataType,
  TableSchema,
  TableService,
} from "@/protogen/querylane/console/v1alpha1/table_pb";
import {
  ViewSchema,
  ViewService,
} from "@/protogen/querylane/console/v1alpha1/view_pb";
import {
  CHANGE_LOG_DEFINITION_SCHEMA,
  CHILD_PARTITION_SCHEMA,
  CUSTOMERS_CONSTRAINT_STATES,
  changeLogPartition,
  changeLogPartitionsSchema,
  column,
  customersSchema,
  EXPLORER_DATABASE_ID,
  EXPLORER_INSTANCE_ID,
  type ExplorerSurfaceCatalog,
  explorerSurfaceServices,
  INVOICES_SCHEMA,
  MATERIALIZED_VIEW_SCHEMA,
  ordered,
  SALES_SCHEMA,
  SCHEMA_MAP_SCHEMAS,
  SCHEMA_SUMMARY,
  type SchemaFixture,
  SHIPMENT_EVENT_BULK_TRIGGERS,
  SHIPMENT_EVENT_CONSTRAINTS,
  SHIPMENT_EVENT_PAGINATED_CONSTRAINTS,
  SHIPMENT_EVENT_TRIGGERS,
  SHIPMENTS_COLUMNS_SCHEMA,
  SHIPMENTS_PAGINATED_INDEXES,
  SHIPMENTS_USAGE_INDEXES,
  STALE_CATALOG_SCHEMA,
  STANDARD_VIEW_SCHEMA,
  shipmentEventSchema,
  shipmentIndexesSchema,
  tableResource,
  VIEW_NOTICES,
} from "@/test/fixtures/data-explorer-surface-fixtures";
import { createTestRouterTransport } from "@/test/router-transport";
import { HarnessProviders } from "@/visual-harness/harness-providers";

rs.mock("@tanstack/react-router", () => {
  const linkExportName = "Link";
  return {
    ...actualRouter,
    [linkExportName]: ({
      children,
      className,
    }: {
      children: ReactNode;
      className?: string | undefined;
    }) => (
      <a className={className} href="#referenced-table">
        {children}
      </a>
    ),
  };
});

const ACTIVE_KIND_FILTER_RE = /^Kind.*Materialized views/;
const ACTIVE_OWNER_FILTER_RE = /^Owner.*analytics_owner/;
const KIND_FILTER_RE = /^Kind$/;
const OWNER_FILTER_RE = /^Owner$/;
// The Objects tab's accessible name includes its count badge.
const OBJECTS_TAB_RE = /^Objects/;
const SCHEMA_MAP_ALL_CHIP_RE = /^All 7$/;
const SCHEMA_MAP_FILTER_RE = /^Schema$/;
const SCHEMA_MAP_ACTIVE_FILTER_RE = /^Schema.*catalog/;
const SCHEMA_MAP_KEY_ABBREVIATION_RE = /\b(?:FK|IDX|PK)\b/;

const APP_READER_SUPPORT_AGENT_RE = /app_reader, support_agent/;
const GENERATED_GENERATION_FILTER_RE = /Generation.*Generated/;
const BIGINT_TYPE_TITLE_RE = /Integer.*64-bit/;
const ID_PRIMARY_KEY_CELL_RE = /id\s+Primary key\s+Surrogate key/;
const JSONB_TYPE_TITLE_RE = /JSON.*binary JSON/;
const NUMERIC_TYPE_TITLE_RE = /Decimal.*Exact decimal/;
const PARTITION_2024_BOUND_RE = /FOR VALUES FROM \('2024-01-01'\)/;
const PARTITION_Q1_ROW_RE = /change_log_2026_q1.*1\.02M/;
const PARTITION_Q2_ROW_RE = /change_log_2026_q2.*1\.18M/;
const PARTITION_Q3_ROW_RE = /change_log_2026_q3 CURRENT.*48k/;
const PARTITION_DEFAULT_ROW_RE = /change_log_archive DEFAULT.*1\.94M/;
const PARTITION_PAGE_ONE_RE = /Showing 1–10 of 12/;
const PARTITION_PAGE_TWO_RE = /Showing 11–12 of 12/;
const PARTITION_PAGE_ALL_RE = /Showing 1–12 of 12/;
// Queries stamp their fetch time from Date.now(). 2024-01-01T23:00:00Z renders
// as "Last fetched 11:00:00 PM" under the pinned TZ=GMT this runner uses,
// matching the mocked data grid label below.
const FETCHED_AT = Date.parse("2024-01-01T23:00:00Z");
// Falls inside change_log_2026_q3, so that partition reads as current.
const PARTITION_REDESIGN_FETCHED_AT = Date.parse("2026-07-07T22:51:48Z");
const LAST_FETCHED_11_PM_RE = /Last fetched 11:00:00 PM/;
const POLICIES_ONE_TAB_RE = /^Policies\s+1$/;
const TABLE_COLUMNS_LAST_FETCHED_RE = /base table · 11 columns · Last fetched/;
const TIMESTAMPTZ_TYPE_TITLE_RE =
  /Timestamp.*timestamptz.*UTC-normalized instant/;
const TRIGGERS_ONE_TAB_RE = /^Triggers\s+1$/;
const CACHE_HIT_HEADER_LABEL =
  "Cache hit. PostgreSQL shared-buffer hit ratio; operating-system cache reads count as reads.";

const explainTransport = rs.hoisted(() => ({
  current: undefined as Transport | undefined,
}));

function requireExplainTransport() {
  if (!explainTransport.current) {
    throw new Error("Render through renderWithCatalog before explaining.");
  }
  return explainTransport.current;
}

// useExplainQuery pins longRunningTransport instead of reading the provider
// transport, so route that one transport to the fixture services too.
rs.mock("@/lib/transport", () => {
  const longRunningTransport: Transport = {
    stream: (...args) => requireExplainTransport().stream(...args),
    unary: (...args) => requireExplainTransport().unary(...args),
  };
  return { ...actualTransport, longRunningTransport };
});

// The data grid has its own visual coverage; here it only supplies the
// header's last-fetched label.
rs.mock("@/components/data-grid/table-data-grid/table-data-grid", () =>
  Object.fromEntries([
    [
      "TableDataGrid",
      ({
        children,
      }: {
        children?: (state: {
          grid: ReactNode;
          lastFetchedLabel: string;
        }) => ReactNode;
      }) => {
        const grid = (
          <div className="rounded-lg border border-border bg-muted/20 p-4 text-muted-foreground text-sm">
            Data grid visual covered separately.
          </div>
        );

        if (children) {
          return (
            <>
              {children({
                grid,
                lastFetchedLabel: "Last fetched 11:00:00 PM",
              })}
            </>
          );
        }

        return grid;
      },
    ],
  ])
);

beforeEach(() => {
  rs.useFakeTimers({ toFake: ["Date"] });
  rs.setSystemTime(FETCHED_AT);
});

afterEach(() => {
  rs.useRealTimers();
});

function requireFacetFilterBar(description: string) {
  const filterBar = document.querySelector<HTMLElement>(
    '[data-slot="facet-filter-bar"]'
  );
  if (!filterBar) {
    throw new Error(`Expected ${description} to render.`);
  }

  return filterBar;
}

function requireIndexSummaryStrip() {
  const strip = document.querySelector<HTMLElement>(
    '[data-slot="index-summary-strip"]'
  );
  if (!strip) {
    throw new Error("Expected the index summary strip to render.");
  }

  return strip;
}

function requireColumnTypeTitle(displayType: string) {
  const typeCell = Array.from(
    document.querySelectorAll<HTMLElement>("td")
  ).find((cell) => cell.textContent?.trim().startsWith(displayType));
  const title = typeCell
    ?.querySelector<HTMLElement>("[title]")
    ?.getAttribute("title");

  if (!title) {
    throw new Error(`Expected ${displayType} type metadata.`);
  }

  return title;
}

/** Renders `ui` with the real connect-query hooks served from `catalog`. */
async function renderWithCatalog(
  ui: ReactNode,
  catalog: ExplorerSurfaceCatalog
) {
  const services = explorerSurfaceServices(catalog);
  const transport = createTestRouterTransport((router) => {
    router.service(SQLService, services.sql);
    router.service(TableService, services.table);
    router.service(ViewService, services.view);
  });
  explainTransport.current = transport;
  await render(<HarnessProviders transport={transport}>{ui}</HarnessProviders>);
}

function Surface({
  children,
  width = "w-[1100px]",
}: {
  children: ReactNode;
  width?: string | undefined;
}) {
  return (
    <ScreenshotFrame>
      <div
        className={cn(
          width,
          "rounded-2xl border border-border bg-background p-8 text-foreground"
        )}
      >
        {children}
      </div>
    </ScreenshotFrame>
  );
}

/** A 1180px surface scaled down into a fixed 850px frame. */
function ScaledSurface({
  children,
  frameClassName,
  scaleClassName,
  testId,
}: {
  children: ReactNode;
  frameClassName: string;
  scaleClassName: string;
  testId: string;
}) {
  return (
    <ScreenshotFrame>
      <div
        className={cn("relative w-[850px] overflow-hidden", frameClassName)}
        data-testid={testId}
      >
        <div
          className={cn(
            "absolute top-0 left-0 w-[1180px] origin-top-left",
            scaleClassName
          )}
        >
          <div className="rounded-2xl border border-border bg-background p-8 text-foreground">
            {children}
          </div>
        </div>
      </div>
    </ScreenshotFrame>
  );
}

function tableMessages(schema: SchemaFixture) {
  return schema.tables.map(({ table }) => create(TableSchema, table));
}

function viewMessages(schema: SchemaFixture) {
  return (schema.views ?? []).map(({ view }) => create(ViewSchema, view));
}

function SchemaOverview({
  schema,
  ...props
}: { schema: SchemaFixture } & Partial<ComponentProps<typeof SchemaDetail>>) {
  return (
    <SchemaDetail
      onSelectTable={() => undefined}
      onSelectView={() => undefined}
      owner={schema.owner ?? "app_owner"}
      schemaName={schema.name}
      tables={tableMessages(schema)}
      tablesError={null}
      tablesLoading={false}
      views={viewMessages(schema)}
      viewsError={null}
      viewsLoading={false}
      {...props}
    />
  );
}

function TableSurface({
  schema,
  tab,
  tableName,
}: {
  schema: SchemaFixture;
  tab: string;
  tableName: string;
}) {
  const fixture = schema.tables.find(
    ({ table }) => table.displayName === tableName
  );
  return (
    <TableDetail
      databaseId={EXPLORER_DATABASE_ID}
      initialTab={tab}
      instanceId={EXPLORER_INSTANCE_ID}
      schemaName={schema.name}
      table={fixture && create(TableSchema, fixture.table)}
      tableName={tableName}
    />
  );
}

/** `surface` is the initial tab, or the tab plus a surface width. */
async function renderTable(
  schema: SchemaFixture,
  tableName: string,
  surface: string | { tab: string; width: string }
) {
  const { tab, width } =
    typeof surface === "string" ? { tab: surface, width: undefined } : surface;
  await renderWithCatalog(
    <Surface width={width}>
      <TableSurface schema={schema} tab={tab} tableName={tableName} />
    </Surface>,
    { schemas: [schema] }
  );
}

function ViewSurface({ schema }: { schema: SchemaFixture }) {
  const [fixture] = schema.views ?? [];
  if (!fixture) {
    throw new Error(`Expected ${schema.name} to define a view.`);
  }
  return (
    <ViewDetail
      view={create(ViewSchema, fixture.view)}
      viewName={fixture.view.displayName ?? ""}
    />
  );
}

const MAP_SCHEMAS = SCHEMA_MAP_SCHEMAS.map(({ name, owner }) => ({
  id: name,
  name,
  owner: owner ?? "app_owner",
}));

function ShippingMap(props: Partial<ComponentProps<typeof ExplorerSchemaMap>>) {
  return (
    <ExplorerSchemaMap
      activeSchemaName="shipping"
      databaseId={EXPLORER_DATABASE_ID}
      enabled={true}
      instanceId={EXPLORER_INSTANCE_ID}
      onSelectTable={() => undefined}
      schemas={MAP_SCHEMAS}
      {...props}
    />
  );
}

/** Serves the schema map catalog and returns the RPC log it fills. */
async function renderMap(
  ui: ReactNode,
  overrides: Omit<ExplorerSurfaceCatalog, "schemas"> = {}
) {
  const requests: string[] = [];
  await renderWithCatalog(ui, {
    requests,
    schemas: SCHEMA_MAP_SCHEMAS,
    ...overrides,
  });
  return requests;
}

/** Resources a `renderMap` RPC log requested through `methods`. */
function requestedResources(requests: string[], ...methods: string[]) {
  return new Set(
    requests.flatMap((request) => {
      const [method = "", resource = ""] = request.split(":");
      return methods.includes(method) ? [resource] : [];
    })
  );
}

test("data explorer schema detail keeps dense table summaries scannable", async () => {
  await renderWithCatalog(
    <Surface>
      <SchemaOverview schema={SCHEMA_SUMMARY} />
    </Surface>,
    { schemas: [SCHEMA_SUMMARY] }
  );

  await expect
    .element(page.getByRole("heading", { name: "customer_success_reporting" }))
    .toBeVisible();
  await expect
    .element(page.getByText("fact_customer_activity_rollup_daily_archive_2026"))
    .toBeVisible();
  await expect
    .element(page.getByText("customer_success_daily_rollups"))
    .toBeVisible();
  await expect
    .element(page.getByRole("cell", { name: "1.3 GB" }))
    .toBeVisible();
  await expect
    .element(page.getByRole("cell", { name: "488.3 MB" }))
    .toBeVisible();
  await expect
    .element(page.getByRole("button", { name: KIND_FILTER_RE }))
    .toBeVisible();
  await expect
    .element(page.getByRole("button", { name: OWNER_FILTER_RE }))
    .not.toBeAttached();
  await expect
    .element(page.getByRole("tab", { name: OBJECTS_TAB_RE }))
    .toBeVisible();
  await expect
    .element(page.getByRole("tab", { name: "Schema map" }))
    .toBeVisible();
  const searchInput = screen.getByLabelText("Search objects…");
  const objectTable = screen.getByRole("table");
  expect(
    searchInput.getBoundingClientRect().left -
      objectTable.getBoundingClientRect().left
  ).toBeLessThanOrEqual(8);
  await expect.element(page.getByText("MATERIALIZED")).toBeVisible();
  // The size column is right-aligned: the formatted cell sits flush to the
  // right edge of its cell.
  const sizeCell = screen.getByRole("cell", { name: "1.3 GB" });
  const sizeValue = sizeCell.querySelector("span") ?? sizeCell;
  expect(
    sizeCell.getBoundingClientRect().right -
      sizeValue.getBoundingClientRect().right
  ).toBeLessThanOrEqual(24);
});

test("data explorer schema detail captures active object filters", async () => {
  await renderWithCatalog(
    <Surface width="w-[900px]">
      <SchemaOverview schema={SALES_SCHEMA} />
    </Surface>,
    { schemas: [SALES_SCHEMA] }
  );

  await page.getByRole("button", { name: KIND_FILTER_RE }).click();
  await page.getByText("Materialized views").last().click();
  await page.getByRole("heading", { name: "sales" }).click();
  await page.getByRole("button", { name: OWNER_FILTER_RE }).click();
  await page.getByText("analytics_owner").last().click();
  await page.getByRole("heading", { name: "sales" }).click();

  await expect.element(page.getByText("daily_rollups")).toBeVisible();
  await expect.element(page.getByText("orders")).not.toBeAttached();
  await expect
    .element(page.getByRole("button", { name: ACTIVE_KIND_FILTER_RE }))
    .toBeVisible();
  await expect
    .element(page.getByRole("button", { name: ACTIVE_OWNER_FILTER_RE }))
    .toBeVisible();
  await expect
    .element(page.getByRole("button", { name: "Clear all" }))
    .toBeVisible();
});

test("data explorer schema detail scopes the map to the selected schema", async () => {
  const [shipping] = SCHEMA_MAP_SCHEMAS;
  if (!shipping) {
    throw new Error("Expected the shipping schema fixture.");
  }
  const requests = await renderMap(
    <SchemaOverview
      activeTab="map"
      databaseId={EXPLORER_DATABASE_ID}
      instanceId={EXPLORER_INSTANCE_ID}
      onSelectTableInSchema={() => undefined}
      schema={shipping}
      schemas={MAP_SCHEMAS}
      views={[]}
    />
  );

  await expect.element(page.getByText("shipments")).toBeVisible();
  await expect.element(page.getByText("ports")).not.toBeAttached();
  await expect.element(page.getByText("change_log")).not.toBeAttached();

  expect(requestedResources(requests, "ListTables", "ListViews")).toEqual(
    new Set([
      buildSchemaName(EXPLORER_INSTANCE_ID, EXPLORER_DATABASE_ID, "shipping"),
    ])
  );
});

test("data explorer schema map shows relationships without a floating help overlay", async () => {
  const onSelectTable = rs.fn();
  const requests = await renderMap(
    <ScreenshotFrame>
      <div className="flex h-[1320px] w-[1132px] bg-background text-foreground">
        <ShippingMap onSelectTable={onSelectTable} />
      </div>
    </ScreenshotFrame>
  );

  await expect
    .element(page.getByRole("heading", { name: "Schema map" }))
    .toBeVisible();
  await expect.element(page.getByText(EXPLORER_DATABASE_ID)).toBeVisible();
  await expect
    .element(page.getByRole("button", { name: SCHEMA_MAP_FILTER_RE }))
    .toBeVisible();
  await expect.element(page.getByText("shipment_event")).toBeVisible();
  await expect.element(page.getByText("shipments")).toBeVisible();
  await expect.element(page.getByText("carriers")).toBeVisible();
  await expect.element(page.getByText("change_log")).toBeVisible();
  await expect
    .element(page.getByRole("searchbox", { name: "Find a table" }))
    .toBeVisible();
  await expect
    .element(page.getByText("Curved lines show foreign keys."))
    .not.toBeAttached();

  expect(requestedResources(requests, "ListTableColumns")).toEqual(
    new Set(
      SCHEMA_MAP_SCHEMAS.flatMap(({ tables }) =>
        tables.map(({ table }) => table.name)
      )
    )
  );

  await page.getByRole("button", { name: SCHEMA_MAP_FILTER_RE }).click();
  await page.getByText("catalog").last().click();
  expect(requestedResources(requests, "ListTableColumns")).toContain(
    tableResource("catalog", "ports")
  );
  await expect
    .element(page.getByRole("button", { name: SCHEMA_MAP_ACTIVE_FILTER_RE }))
    .toBeVisible();
  await page.getByRole("button", { name: "Reset" }).click();

  const map = document.querySelector<SVGElement>(
    'svg[data-testid="schema-map-canvas"]'
  );
  const initialWidth = Number(map?.getAttribute("width"));
  await page.getByRole("button", { name: "Zoom in" }).click();
  expect(Number(map?.getAttribute("width"))).toBeGreaterThan(initialWidth);

  await page.getByRole("button", { name: "shipping.shipments" }).click();
  await expect
    .element(page.getByRole("button", { name: "Open data" }))
    .toBeVisible();
  await page.getByRole("button", { name: "Open data" }).click();
  expect(onSelectTable).toHaveBeenCalledWith("shipping", "shipments");

  onSelectTable.mockClear();
  const shipmentsButton = screen.getByRole("button", {
    name: "shipping.shipments",
  });
  shipmentsButton.focus();
  shipmentsButton.dispatchEvent(
    new KeyboardEvent("keydown", { bubbles: true, key: "Enter" })
  );
  expect(onSelectTable).toHaveBeenCalledWith("shipping", "shipments");

  await page
    .getByRole("searchbox", { name: "Find a table" })
    .fill("change_log");
  await expect.element(page.getByText("change_log")).toBeVisible();
  await expect
    .element(page.getByText("shipments", { exact: true }))
    .not.toBeAttached();
}, 30_000);

test("data explorer schema map loads table details without selection", async () => {
  const requests = await renderMap(<ShippingMap />);

  await expect.element(page.getByText("change_log")).toBeVisible();
  await expect
    .element(page.getByText("Select table to load details."))
    .not.toBeAttached();
  expect(requestedResources(requests, "ListTableColumns")).toContain(
    tableResource("audit", "change_log")
  );
});

test("data explorer schema map selection does not move nodes", async () => {
  await renderMap(<ShippingMap />);

  await expect
    .element(page.getByRole("button", { name: "catalog.routes" }))
    .toBeVisible();
  const captureNodeLayout = () =>
    Array.from(
      document.querySelectorAll<SVGElement>(
        'svg[data-testid="schema-map-canvas"] foreignObject'
      )
    ).flatMap((boundary) => {
      const button = boundary.querySelector("button[aria-label]");
      return button
        ? [
            {
              id: button.getAttribute("aria-label"),
              x: boundary.getAttribute("x"),
              y: boundary.getAttribute("y"),
            },
          ]
        : [];
    });
  const layoutBeforeSelection = captureNodeLayout();

  await page.getByRole("button", { name: "catalog.ports" }).click();

  expect(captureNodeLayout()).toEqual(layoutBeforeSelection);
});

test("data explorer schema map uses a compact schema filter at narrow widths", async () => {
  await renderMap(
    <ScreenshotFrame>
      <div className="flex h-[900px] w-[680px] bg-background text-foreground">
        <ShippingMap />
      </div>
    </ScreenshotFrame>
  );

  await expect
    .element(page.getByRole("button", { name: SCHEMA_MAP_FILTER_RE }))
    .toBeVisible();
  await expect
    .element(page.getByRole("button", { name: SCHEMA_MAP_ALL_CHIP_RE }))
    .not.toBeAttached();

  await page.getByRole("button", { name: SCHEMA_MAP_FILTER_RE }).click();
  await page.getByText("catalog").last().click();

  await expect.element(page.getByText("ports")).toBeVisible();
  await expect.element(page.getByText("shipments")).not.toBeAttached();
});

test("data explorer schema map keeps schema labels clear of group borders", async () => {
  await renderMap(<ShippingMap />);

  await expect.element(page.getByTestId("schema-map-canvas")).toBeVisible();

  const canvas = document.querySelector('svg[data-testid="schema-map-canvas"]');
  const firstSchemaGroup = canvas?.querySelector("g");
  const firstHull = firstSchemaGroup?.querySelector("rect");
  const shippingLabel = firstSchemaGroup?.querySelector("text");
  if (
    !(
      firstHull instanceof SVGRectElement &&
      shippingLabel instanceof SVGGraphicsElement
    )
  ) {
    throw new Error("Expected the shipping schema label and hull to render.");
  }

  const labelBox = shippingLabel.getBBox();
  const borderY = Number(firstHull.getAttribute("y"));
  expect(labelBox.y + labelBox.height).toBeLessThanOrEqual(borderY - 4);
});

test("data explorer schema map spells out uppercase key labels", async () => {
  await renderMap(<ShippingMap />);

  await expect.element(page.getByText("PRIMARY KEY").first()).toBeVisible();
  await expect.element(page.getByText("FOREIGN KEY").first()).toBeVisible();
  expect(document.body.textContent).not.toMatch(SCHEMA_MAP_KEY_ABBREVIATION_RE);
});

test("data explorer schema map does not clip table card decoration", async () => {
  await renderMap(<ShippingMap />);

  const tableCardLocator = page.getByRole("button", {
    name: "shipping.carriers",
  });
  await expect.element(tableCardLocator).toBeVisible();
  const tableCard = screen.getByRole("button", {
    name: "shipping.carriers",
  });
  const cardBoundary = tableCard.closest("foreignObject");
  if (!(cardBoundary instanceof SVGElement)) {
    throw new Error("Expected the table card SVG boundary to render.");
  }

  expect(getComputedStyle(cardBoundary).overflow).toBe("visible");
});

test("data explorer schema map emphasizes incoming and outgoing relationships", async () => {
  await renderMap(<ShippingMap />);

  await expect.element(page.getByText("FOREIGN KEY").first()).toBeVisible();
  await page.getByRole("button", { name: "shipping.shipments" }).click();

  const relationshipPath = (label: string) => {
    const path = document.querySelector(`path[aria-label="${label}"]`);
    if (!(path instanceof SVGPathElement)) {
      throw new Error(`Expected the ${label} relationship to render.`);
    }
    return path;
  };
  const outgoing = relationshipPath(
    "shipments.carrier_id references carriers.id"
  );
  const incoming = relationshipPath(
    "containers.shipment_id references shipments.id"
  );

  for (const connected of [outgoing, incoming]) {
    expect(connected.getAttribute("stroke-dasharray")).toBe("7 5");
    // The dash animation is covered in Playwright: this runner forces
    // prefers-reduced-motion, which turns it off.
    expect(getComputedStyle(connected).opacity).toBe("0.95");
  }

  await page.getByRole("button", { name: "shipping.carriers" }).click();
  expect(getComputedStyle(outgoing).opacity).toBe("0.95");
  expect(getComputedStyle(incoming).opacity).toBe("0.1");
});

test("data explorer schema map places controls directly after the schema filter", async () => {
  await renderMap(<ShippingMap />);

  const schemaFilterLocator = page.getByRole("button", {
    name: SCHEMA_MAP_FILTER_RE,
  });
  await expect.element(schemaFilterLocator).toBeVisible();
  const schemaFilter = screen.getByRole("button", {
    name: SCHEMA_MAP_FILTER_RE,
  });
  expect(
    schemaFilter.nextElementSibling?.querySelector(
      'input[aria-label="Find a table"]'
    )
  ).not.toBeNull();
});

test("data explorer schema map surfaces partial catalog failures and truncation", async () => {
  await renderMap(<ShippingMap />, {
    failing: ["ListViews"],
    truncatedSchemas: ["shipping"],
  });

  await expect
    .element(page.getByText("Some schema metadata could not load"))
    .toBeVisible();
  await expect
    .element(
      page.getByText(
        "Some schemas have more objects. This map shows the first loaded page."
      )
    )
    .toBeVisible();
});

test("data explorer schema map omits tables whose details fail", async () => {
  await renderMap(<ShippingMap />, {
    failing: [tableResource("catalog", "routes")],
  });

  await expect
    .element(page.getByText("Some schema metadata could not load"))
    .toBeVisible();
  await expect
    .element(page.getByRole("button", { name: "catalog.ports" }))
    .toBeVisible();
  await expect
    .element(page.getByRole("button", { name: "catalog.routes" }))
    .not.toBeAttached();
});

test("data explorer materialized view detail stays readable", async () => {
  await renderWithCatalog(
    <Surface>
      <ViewSurface schema={MATERIALIZED_VIEW_SCHEMA} />
    </Surface>,
    { schemas: [MATERIALIZED_VIEW_SCHEMA] }
  );

  await expect
    .element(
      page.getByRole("heading", {
        name: "customer_success_daily_rollups",
      })
    )
    .toBeVisible();
  await expect
    .element(page.getByText("Materialized view · owner: analytics_owner"))
    .toBeVisible();
});

test("data explorer view notice check displays returned notices", async () => {
  await renderWithCatalog(
    <Surface width="w-[980px]">
      <ViewSurface schema={STANDARD_VIEW_SCHEMA} />
    </Surface>,
    { explainNotices: VIEW_NOTICES, schemas: [STANDARD_VIEW_SCHEMA] }
  );

  await page.getByRole("button", { name: "Check database notices" }).click();
  await expect
    .element(page.getByRole("heading", { name: "Returned notices" }))
    .toBeVisible();
  await expect
    .element(page.getByText("HINT: Refresh the view if estimates look stale"))
    .toBeVisible();
});

test("data explorer schema detail highlights stale catalog warnings", async () => {
  await renderWithCatalog(
    <Surface>
      <SchemaOverview
        schema={STALE_CATALOG_SCHEMA}
        tablesSyncNotice={catalogSyncNotice(
          create(
            CatalogSyncMetadataSchema,
            STALE_CATALOG_SCHEMA.tablesSyncMetadata
          )
        )}
      />
    </Surface>,
    { schemas: [STALE_CATALOG_SCHEMA] }
  );

  await expect
    .element(page.getByText("Showing cached catalog. Refresh failed."))
    .toBeVisible();
});

test("data explorer table columns match the redesign inventory", async () => {
  await renderTable(SHIPMENTS_COLUMNS_SCHEMA, "shipments", "columns");

  await expect
    .element(page.getByRole("columnheader", { exact: true, name: "Storage" }))
    .toBeVisible();
  await expect
    .element(page.getByRole("columnheader", { exact: true, name: "Distinct" }))
    .toBeVisible();
  await expect
    .element(page.getByRole("columnheader", { exact: true, name: "Null %" }))
    .toBeVisible();
  await expect
    .element(page.getByRole("columnheader", { exact: true, name: "Avg width" }))
    .toBeVisible();
  await expect
    .element(page.getByRole("cell", { name: ID_PRIMARY_KEY_CELL_RE }))
    .toBeVisible();
  await expect.element(page.getByText("Unique", { exact: true })).toBeVisible();
  await expect.element(page.getByText("Foreign key")).toBeVisible();
  await expect.element(page.getByText("Index", { exact: true })).toBeVisible();
  await expect
    .element(page.getByText("Human-readable booking reference"))
    .toBeVisible();
  await expect.element(page.getByText("Set NULL once delivered")).toBeVisible();
  await expect
    .element(page.getByText("11 columns · 4 indexed · 1 nullable"))
    .not.toBeAttached();
  await expect
    .element(page.getByText(TABLE_COLUMNS_LAST_FETCHED_RE))
    .toBeVisible();
  await expect.element(page.getByText("table · 4 columns")).not.toBeAttached();

  const searchInput = screen.getByRole("textbox", { name: "Search columns…" });
  const filterBar = requireFacetFilterBar("column facet filters");
  expect(filterBar.textContent).toContain("Type");
  expect(filterBar.textContent).toContain("Key");
  expect(filterBar.textContent).toContain("Nullability");
  expect(filterBar.textContent).toContain("Default");
  expect(filterBar.textContent).toContain("Generation");
  expect(filterBar.textContent).not.toContain("__all__");
  expect(filterBar.getBoundingClientRect().left).toBeGreaterThan(
    searchInput.getBoundingClientRect().right
  );
  expect(
    Math.abs(
      filterBar.getBoundingClientRect().top -
        searchInput.getBoundingClientRect().top
    )
  ).toBeLessThanOrEqual(4);

  await page.getByRole("button", { exact: true, name: "Key" }).click();
  await Promise.all(
    ["Primary key", "Foreign key", "Unique", "Index", "No key"].map((option) =>
      expect
        .element(page.getByRole("option", { exact: true, name: option }))
        .toBeVisible()
    )
  );
  await page.getByRole("button", { exact: true, name: "Key" }).click();

  await page.getByRole("button", { exact: true, name: "Generation" }).click();
  await expect
    .element(page.getByRole("option", { exact: true, name: "Identity" }))
    .toBeVisible();
  await expect
    .element(page.getByRole("option", { exact: true, name: "Generated" }))
    .toBeVisible();
  await expect
    .element(page.getByRole("option", { exact: true, name: "Regular" }))
    .toBeVisible();
  await page.getByRole("option", { exact: true, name: "Generated" }).click();
  await page
    .getByRole("button", { name: GENERATED_GENERATION_FILTER_RE })
    .click();
  await expect.element(page.getByText("route_code")).toBeVisible();
  expect(document.querySelectorAll("tbody tr")).toHaveLength(1);
  await page.getByRole("button", { exact: true, name: "Reset" }).click();

  await expect
    .element(page.getByRole("tab", { exact: true, name: "Columns 11" }))
    .toBeVisible();
  await expect.element(page.getByText("Showing 1–10 of 11")).toBeVisible();
  await expect.element(page.getByText("Page 1 of 2")).toBeVisible();
  await expect
    .element(page.getByRole("button", { name: "Next page" }))
    .toBeEnabled();
  await page.getByRole("button", { name: "Next page" }).click();
  await expect.element(page.getByText("created_at")).toBeVisible();
  await expect.element(page.getByText("Showing 11–11 of 11")).toBeVisible();
  await page.getByRole("button", { name: "Previous page" }).click();
  await page
    .getByRole("button", { exact: true, name: "Column, not sorted" })
    .click();
  await expect
    .element(
      page.getByRole("button", {
        exact: true,
        name: "Column, sorted ascending",
      })
    )
    .toBeVisible();
  expect(
    document.querySelector("tbody tr:first-child td:nth-child(2)")?.textContent
  ).toContain("carrier_id");
  await page
    .getByRole("textbox", { exact: true, name: "Search columns…" })
    .fill("eta");
  await expect.element(page.getByText("Set NULL once delivered")).toBeVisible();
  await expect
    .element(page.getByText("1 column · 0 indexed · 1 nullable"))
    .not.toBeAttached();
  expect(document.querySelectorAll("tbody tr")).toHaveLength(1);
});

test("data explorer table keys preserve the existing relationship view", async () => {
  await renderTable(customersSchema(), "customers", "keys");

  await expect.element(page.getByText("Primary key").first()).toBeVisible();
  await expect.element(page.getByText("customers_pkey")).toBeVisible();
  await expect.element(page.getByText("Foreign key").first()).toBeVisible();
  await expect
    .element(page.getByText("account_id → public.accounts(id)"))
    .toBeVisible();
  await expect.element(page.getByText("Secondary index").first()).toBeVisible();
  await expect
    .element(page.getByText("customers_status_account_idx"))
    .toBeVisible();
});

test("data explorer table columns show generated and identity metadata", async () => {
  await renderTable(SHIPMENTS_COLUMNS_SCHEMA, "shipments", "columns");

  await expect.element(page.getByText("IDENTITY")).toBeVisible();
  await expect.element(page.getByText("BY DEFAULT")).toBeVisible();
  await expect.element(page.getByText("GENERATED")).toBeVisible();
  await expect
    .element(page.getByText("AS origin_port || ':' || dest_port"))
    .toBeVisible();

  const badgeRow = screen.getByText("IDENTITY").parentElement;
  if (!badgeRow) {
    throw new Error("Expected identity badges to render in a row.");
  }
  expect(badgeRow.scrollWidth).toBeLessThanOrEqual(badgeRow.clientWidth);
});

test("data explorer table tabs stay visible when column metadata overflows", async () => {
  const customers = customersSchema();
  await renderWithCatalog(
    <ScreenshotFrame>
      <div className="flex h-[320px] w-[1100px] flex-col overflow-hidden rounded-2xl border border-border bg-background p-8 text-foreground">
        <TableSurface schema={customers} tab="data" tableName="customers" />
      </div>
    </ScreenshotFrame>,
    { schemas: [customers] }
  );

  await page.getByRole("tab", { exact: true, name: "Columns 4" }).click();

  const tabsList = document.querySelector('[data-slot="tabs-list"]');
  const tabsScroller = tabsList?.parentElement;
  if (!(tabsList && tabsScroller)) {
    throw new Error("Expected table detail tabs to render.");
  }

  expect(tabsScroller.getBoundingClientRect().height).toBeGreaterThanOrEqual(
    tabsList.getBoundingClientRect().height
  );
});

test("data explorer table indexes have a redesigned table baseline", async () => {
  await renderTable(customersSchema(), "customers", "indexes");

  await expect
    .element(page.getByText("customers_status_account_idx"))
    .toBeVisible();
  await expect.element(page.getByText("btree").first()).toBeVisible();
  await expect.element(page.getByText("Scans").first()).toBeVisible();
  expect(requireIndexSummaryStrip().textContent).toBe(
    "2 indexes · 416 KB total vs heap 40.5 MB · 30 scans since stats reset"
  );
  const indexSearch = screen.getByRole("textbox", { name: "Search indexes…" });
  const indexFilterBar = requireFacetFilterBar("index facet filters");
  await expect
    .element(page.getByRole("button", { exact: true, name: "Method" }))
    .toBeVisible();
  await expect
    .element(page.getByRole("combobox", { name: "Rows per page" }))
    .toBeVisible();
  const searchBox = indexSearch.getBoundingClientRect();
  const filterBox = indexFilterBar.getBoundingClientRect();
  expect(filterBox.left).toBeGreaterThan(searchBox.right);
  expect(Math.abs(filterBox.top - searchBox.top)).toBeLessThanOrEqual(1);
  await expect
    .element(page.getByRole("button", { name: CACHE_HIT_HEADER_LABEL }))
    .toBeVisible();
  expect(document.body.textContent).not.toContain("Usage from");
  // Included columns render inside the Columns cell with the full text in
  // its title; the CREATE INDEX SQL lives in the per-row copy button value
  // instead of body text.
  await expect
    .element(page.getByTitle("(status, account_id) INCLUDE (last_seen_at)"))
    .toBeVisible();
  await expect
    .element(page.getByRole("button", { name: "Copy CREATE INDEX SQL" }))
    .toHaveCount(2);
});

test("data explorer table indexes constraints policies and triggers stay readable", async () => {
  await renderTable(customersSchema(), "customers", "indexes");

  await expect
    .element(page.getByText("customers_status_account_idx"))
    .toBeVisible();
  await expect.element(page.getByText("btree").first()).toBeVisible();
  await expect.element(page.getByText("Scans").first()).toBeVisible();
  expect(requireIndexSummaryStrip().textContent).toBe(
    "2 indexes · 416 KB total vs heap 40.5 MB · 30 scans since stats reset"
  );
  await expect
    .element(page.getByRole("button", { name: CACHE_HIT_HEADER_LABEL }))
    .toBeVisible();
  expect(document.body.textContent).not.toContain("Usage from");
  await expect
    .element(page.getByTitle("(status, account_id) INCLUDE (last_seen_at)"))
    .toBeVisible();
  await expect
    .element(page.getByRole("button", { name: "Copy CREATE INDEX SQL" }))
    .toHaveCount(2);

  await page.getByRole("tab", { exact: true, name: "Constraints 2" }).click();
  // Visited tab panels stay mounted but hidden; scope to the visible one.
  const constraintsPanel = page.getByRole("tabpanel", { name: "Constraints" });
  await expect
    .element(constraintsPanel.getByText("customers_pkey"))
    .toBeVisible();
  await expect
    .element(constraintsPanel.getByText("customers_account_id_fkey"))
    .toBeVisible();
  await expect
    .element(constraintsPanel.getByText("PRIMARY KEY", { exact: true }))
    .toBeVisible();
  await expect
    .element(constraintsPanel.getByText("FOREIGN KEY", { exact: true }))
    .toBeVisible();
  await expect
    .element(constraintsPanel.getByText("public.accounts ↗"))
    .toBeVisible();
  expect(
    document.querySelector('[data-slot="facet-filter-bar"]')
  ).not.toBeNull();
  expect(document.querySelector("table")).not.toBeNull();
  expect(document.body.textContent).not.toContain(
    "Keys primary key and uniqueness"
  );

  await page.getByRole("tab", { exact: true, name: "Policies 1" }).click();
  await expect
    .element(
      page.getByRole("heading", {
        exact: true,
        name: "customers_account_read_policy",
      })
    )
    .toBeVisible();
  await expect
    .element(page.getByText(APP_READER_SUPPORT_AGENT_RE))
    .toBeVisible();
  await expect
    .element(page.getByText("How the server combines these"))
    .toBeVisible();
  await expect
    .element(page.getByRole("combobox", { name: "Policy command" }))
    .toBeVisible();

  await page.getByRole("tab", { exact: true, name: "Triggers 1" }).click();
  await expect
    .element(page.getByText("customers_audit_trigger").first())
    .toBeVisible();
});

test("data explorer constraints tab matches the redesigned table", async () => {
  await renderTable(
    shipmentEventSchema({ constraints: SHIPMENT_EVENT_CONSTRAINTS }),
    "shipment_event",
    "constraints"
  );

  await expect.element(page.getByText("shipment_event_pkey")).toBeVisible();
  await expect
    .element(page.getByText("shipment_event_shipment_id_fkey"))
    .toBeVisible();
  await expect
    .element(page.getByText("PRIMARY KEY", { exact: true }))
    .toBeVisible();
  await expect
    .element(page.getByText("FOREIGN KEY", { exact: true }))
    .toBeVisible();
  // Referential actions live inside the definition cell (full text in title).
  await expect
    .element(
      page.getByTitle(
        "FOREIGN KEY (shipment_id) REFERENCES shipping.shipments(id) ON DELETE CASCADE"
      )
    )
    .toBeVisible();
  await expect.element(page.getByText("shipping.shipments ↗")).toBeVisible();
  await expect
    .element(page.getByText("Last fetched 11:00:00 PM", { exact: true }))
    .toBeVisible();
  await expect
    .element(page.getByRole("button", { name: "Refresh" }))
    .toBeVisible();
  await expect
    .element(
      page.getByRole("textbox", {
        name: "Search constraints…",
      })
    )
    .toBeVisible();
  await expect
    .element(page.getByRole("button", { name: KIND_FILTER_RE }))
    .toBeVisible();
  expect(
    document.querySelector('[data-slot="facet-filter-bar"]')
  ).not.toBeNull();
  expect(document.querySelector("table")).not.toBeNull();
  expect(document.body.textContent).not.toContain(
    "Keys primary key and uniqueness"
  );
  expect(document.body.textContent).not.toContain("validated");
});

test("data explorer constraints tab paginates the dense table", async () => {
  await renderTable(
    shipmentEventSchema({ constraints: SHIPMENT_EVENT_PAGINATED_CONSTRAINTS }),
    "shipment_event",
    "constraints"
  );

  await expect
    .element(page.getByRole("combobox", { name: "Rows per page" }))
    .toBeVisible();
  await expect.element(page.getByText("Showing 1–10 of 11")).toBeVisible();
  await expect.element(page.getByText("Page 1 of 2")).toBeVisible();
  await page.getByRole("button", { name: "Next page" }).click();
  await expect
    .element(page.getByText("shipment_event_status_11_check"))
    .toBeVisible();
  await expect.element(page.getByText("Showing 11–11 of 11")).toBeVisible();
  await expect.element(page.getByText("Page 2 of 2")).toBeVisible();
});

test("data explorer constraints tab covers validation and action states", async () => {
  await renderTable(
    customersSchema({ constraints: CUSTOMERS_CONSTRAINT_STATES }),
    "customers",
    "constraints"
  );

  // Referential actions render as part of the definition cell text.
  await expect
    .element(
      page.getByTitle(
        "FOREIGN KEY (account_id) REFERENCES public.accounts(id) ON UPDATE SET NULL ON DELETE RESTRICT"
      )
    )
    .toBeVisible();
  await expect
    .element(page.getByText("Not valid", { exact: true }))
    .toBeVisible();
  await expect.element(page.getByText("CHECK").first()).toBeVisible();
  await expect.element(page.getByText("EXCLUSION")).toBeVisible();
  expect(document.body.textContent).not.toContain(
    "Checks row-level validation rules"
  );
  expect(document.body.textContent).not.toContain(
    "Other constraints exclusion and other rules"
  );
});

test("data explorer table policies explain RLS composition", async () => {
  await renderTable(INVOICES_SCHEMA, "invoices", "policies");

  await expect
    .element(
      page.getByRole("heading", { exact: true, name: "invoices_tenant_all" })
    )
    .toBeVisible();
  await expect
    .element(page.getByRole("textbox", { name: "Search policies…" }))
    .toBeVisible();
  await expect
    .element(page.getByRole("button", { exact: true, name: "Mode" }))
    .toBeVisible();
  const pageSizeHeight = screen
    .getByRole("combobox", { name: "Rows per page" })
    .getBoundingClientRect().height;
  expect(pageSizeHeight).toBeGreaterThanOrEqual(28);
  const paginationBox = screen
    .getByRole("group", { name: "Policies pagination" })
    .getBoundingClientRect();
  const pageSizeBox = screen
    .getByRole("combobox", { name: "Rows per page" })
    .getBoundingClientRect();
  expect(pageSizeBox.left).toBeGreaterThan(
    paginationBox.left + paginationBox.width / 2
  );
  expect(
    screen
      .getByRole("button", { name: "Previous policies page" })
      .getBoundingClientRect().height
  ).toBe(28);
  expect(
    screen
      .getByRole("button", { name: "Next policies page" })
      .getBoundingClientRect().height
  ).toBe(28);
  await expect
    .element(page.getByText("2 permissive policies apply", { exact: false }))
    .toBeVisible();
});

test("data explorer table indexes match the redesign complex usage scenario", async () => {
  const shipments = shipmentIndexesSchema(SHIPMENTS_USAGE_INDEXES);
  await renderWithCatalog(
    <ScaledSurface
      frameClassName="h-[930px]"
      scaleClassName="scale-[0.72]"
      testId="indexes-complex-frame"
    >
      <TableSurface schema={shipments} tab="indexes" tableName="shipments" />
    </ScaledSurface>,
    { schemas: [shipments] }
  );

  await expect
    .element(page.getByRole("heading", { name: "shipping.shipments" }))
    .toBeVisible();
  await expect
    .element(page.getByRole("tab", { exact: true, name: "Indexes 4" }))
    .toBeVisible();
  await expect.element(page.getByText("shipments_pkey")).toBeVisible();
  await expect.element(page.getByText("shipments_status_idx")).toBeVisible();
  await expect
    .element(page.getByText("shipments_carrier_id_idx"))
    .toBeVisible();
  await expect
    .element(page.getByText("shipments_legacy_ref_idx"))
    .toBeVisible();
  expect(requireIndexSummaryStrip().textContent).toBe(
    "4 indexes · 478 MB total vs heap 12.8 GB · 58.7M scans since stats reset · 1 unused"
  );
  await expect.element(page.getByText("48.1M")).toBeVisible();
  await expect.element(page.getByText("99.7%")).toBeVisible();
  await expect.element(page.getByText("Unused", { exact: true })).toBeVisible();
  // Predicate and expression details live in the Columns cells.
  await expect
    .element(page.getByTitle("(status) WHERE status <> 'delivered'"))
    .toBeVisible();
  await expect.element(page.getByTitle("(lower(ref))")).toBeVisible();
  await expect
    .element(page.getByRole("textbox", { name: "Search indexes…" }))
    .toBeVisible();
  await expect
    .element(page.getByRole("button", { exact: true, name: "Method" }))
    .toBeVisible();
  await expect
    .element(page.getByRole("combobox", { name: "Rows per page" }))
    .toBeVisible();
  await expect
    .element(page.getByRole("button", { name: "Copy CREATE INDEX SQL" }))
    .toHaveCount(4);
});

test("data explorer table indexes pagination has a visual baseline", async () => {
  const shipments = shipmentIndexesSchema(SHIPMENTS_PAGINATED_INDEXES);
  await renderWithCatalog(
    <ScaledSurface
      frameClassName="h-[1000px]"
      scaleClassName="scale-[0.62]"
      testId="indexes-pagination-frame"
    >
      <TableSurface schema={shipments} tab="indexes" tableName="shipments" />
    </ScaledSurface>,
    { schemas: [shipments] }
  );

  await page.getByRole("button", { name: "Next page" }).click();

  await expect.element(page.getByText("shipments_route_11_idx")).toBeVisible();
  await expect.element(page.getByText("Showing 11–11 of 11")).toBeVisible();
  await expect.element(page.getByText("Page 2 of 2")).toBeVisible();
  await expect
    .element(page.getByRole("combobox", { name: "Rows per page" }))
    .toBeVisible();
});

test("data explorer table triggers match redesign", async () => {
  await renderTable(
    shipmentEventSchema({ triggers: SHIPMENT_EVENT_TRIGGERS }),
    "shipment_event",
    "triggers"
  );

  const triggerSearch = page.getByRole("textbox", {
    exact: true,
    name: "Search triggers…",
  });
  const triggerStateFilter = page.getByRole("button", {
    exact: true,
    name: "State",
  });
  await expect.element(triggerSearch).toBeVisible();
  await expect.element(triggerStateFilter).toBeVisible();
  const searchBounds = screen
    .getByRole("textbox", { name: "Search triggers…" })
    .getBoundingClientRect();
  const stateBounds = screen
    .getByRole("button", { name: "State" })
    .getBoundingClientRect();
  expect(stateBounds.left).toBeGreaterThan(searchBounds.right);
  expect(Math.abs(stateBounds.top - searchBounds.top)).toBeLessThanOrEqual(1);
  await expect
    .element(page.getByText("trg_event_enrich").first())
    .toBeVisible();
  await expect
    .element(page.getByText("→ shipping.enrich_event_location()"))
    .toBeVisible();
  await expect.element(page.getByText("ROW").first()).toBeVisible();
  await expect
    .element(page.getByText("disabled", { exact: true }))
    .toBeVisible();
  await expect
    .element(
      page.getByText("WHEN ((old.status IS DISTINCT FROM new.status))", {
        exact: true,
      })
    )
    .toBeVisible();
  await expect.element(page.getByText("STATEMENT").first()).toBeVisible();
  await document.fonts.ready;

  await triggerStateFilter.click();
  const disabledOption = page.getByRole("option", {
    exact: true,
    name: "Disabled",
  });
  await expect.element(disabledOption).toBeVisible();

  await disabledOption.click();
  await expect
    .element(page.getByText("trg_event_enrich").first())
    .not.toBeAttached();
  await expect
    .element(page.getByText("trg_shipments_notify").first())
    .toBeVisible();
  await page
    .getByRole("button", { exact: true, name: "State Disabled" })
    .click();
  await triggerSearch.fill("missing");
  await expect.element(page.getByText("No triggers found")).toBeVisible();
});

test("data explorer trigger cards paginate dense resources", async () => {
  await renderTable(
    shipmentEventSchema({ triggers: SHIPMENT_EVENT_BULK_TRIGGERS }),
    "shipment_event",
    "triggers"
  );

  await expect.element(page.getByText("Page 1 of 2")).toBeVisible();
  await expect
    .element(page.getByRole("combobox", { name: "Triggers per page" }))
    .toBeVisible();
  await expect.element(page.getByText("trg_bulk_00").first()).toBeVisible();
  await expect
    .element(page.getByText("trg_bulk_10").first())
    .not.toBeAttached();
  const pageSizeSelect = screen.getByRole("combobox", {
    name: "Triggers per page",
  });
  const paginationFooter = pageSizeSelect.closest(
    '[data-slot="pagination-footer"]'
  );
  if (!paginationFooter) {
    throw new Error("expected trigger pagination footer");
  }
  paginationFooter.scrollIntoView({ block: "center" });
  await document.fonts.ready;

  await page.getByRole("button", { name: "Next page" }).click();
  await expect.element(page.getByText("Page 2 of 2")).toBeVisible();
  await expect.element(page.getByText("trg_bulk_10").first()).toBeVisible();
  await expect
    .element(page.getByText("trg_bulk_00").first())
    .not.toBeAttached();

  await page.getByRole("combobox", { name: "Triggers per page" }).click();
  await page.getByRole("option", { exact: true, name: "25" }).click();
  await expect.element(page.getByText("Page 1 of 1")).toBeVisible();
  await expect.element(page.getByText("trg_bulk_00").first()).toBeVisible();
  await expect.element(page.getByText("trg_bulk_11").first()).toBeVisible();
});

test("data explorer table data tab has a visual baseline", async () => {
  await renderTable(customersSchema(), "customers", "data");

  await expect
    .element(page.getByText("Data grid visual covered separately."))
    .toBeVisible();
  await expect
    .element(page.getByText(LAST_FETCHED_11_PM_RE).first())
    .toBeVisible();
});

test("data explorer table definition tab has a visual baseline", async () => {
  await renderTable(CHANGE_LOG_DEFINITION_SCHEMA, "change_log", "definition");

  await expect
    .element(page.getByRole("heading", { name: "Create table" }))
    .toBeVisible();
  await expect
    .element(page.getByRole("tab", { name: POLICIES_ONE_TAB_RE }))
    .toBeVisible();
  await expect
    .element(page.getByRole("tab", { name: TRIGGERS_ONE_TAB_RE }))
    .toBeVisible();
  await expect
    .element(page.getByRole("heading", { name: "Reproduce locally" }))
    .toBeVisible();
  await expect
    .element(page.getByRole("heading", { name: "Policies" }))
    .toBeVisible();
  await expect
    .element(page.getByRole("heading", { name: "Triggers" }))
    .toBeVisible();
  await expect
    .element(page.getByText("Copy all steps", { exact: true }))
    .toBeVisible();
  expect(
    document.querySelectorAll(
      'code.language-sql[data-syntax-highlighter="shiki"]'
    ).length
  ).toBeGreaterThan(2);
  const dumpCommand = screen.getByRole("region", {
    name: "Dump schema only command",
  });
  const dumpCommandCode = dumpCommand.querySelector("pre");
  if (!dumpCommandCode) {
    throw new Error("Expected the highlighted dump command to render.");
  }
  expect(getComputedStyle(dumpCommandCode).whiteSpace).toBe("pre");
}, 10_000);

test("data explorer table definition stays a full-width vertical flow", async () => {
  await renderTable(CHANGE_LOG_DEFINITION_SCHEMA, "change_log", "definition");

  await expect
    .element(page.getByRole("heading", { name: "Referenced tables" }))
    .toBeVisible();
  await expect
    .element(page.getByRole("heading", { name: "Reproduce locally" }))
    .toBeVisible();

  function cardForHeading(name: string) {
    const card = screen
      .getByRole("heading", { name })
      .closest<HTMLElement>('[data-slot="card"]');
    if (!card) {
      throw new Error(`Expected the ${name} card to render.`);
    }
    return card;
  }

  const createTableCard = cardForHeading("Create table");
  const triggersCard = cardForHeading("Triggers");
  const referencedTablesCard = cardForHeading("Referenced tables");
  const reproduceCard = cardForHeading("Reproduce locally");
  const createTableRect = createTableCard.getBoundingClientRect();
  const referencedTablesRect = referencedTablesCard.getBoundingClientRect();
  const reproduceRect = reproduceCard.getBoundingClientRect();

  expect(Math.abs(createTableRect.left - reproduceRect.left)).toBeLessThan(2);
  expect(Math.abs(createTableRect.width - reproduceRect.width)).toBeLessThan(2);
  expect(
    Math.abs(createTableRect.width - referencedTablesRect.width)
  ).toBeLessThan(2);
  expect(referencedTablesRect.top).toBeGreaterThan(
    triggersCard.getBoundingClientRect().bottom
  );
  expect(reproduceRect.top).toBeGreaterThan(referencedTablesRect.bottom);

  const frame = screen.getByTestId("screenshot-frame");
  expect(frame.scrollWidth).toBeLessThanOrEqual(frame.clientWidth + 1);
});

test("data explorer definition toolbar keeps refresh reachable when narrow", async () => {
  await renderTable(CHANGE_LOG_DEFINITION_SCHEMA, "change_log", {
    tab: "definition",
    width: "w-[420px]",
  });

  await expect
    .element(page.getByText("Schema document", { exact: true }))
    .toBeVisible();
  await expect
    .element(page.getByRole("button", { exact: true, name: "Refresh" }))
    .toBeVisible();
  const caption = screen.getByText("Schema document");
  const toolbar = caption.parentElement;
  const refresh = screen.getByRole("button", { name: "Refresh" });
  if (!toolbar) {
    throw new Error("Expected the definition toolbar to render.");
  }

  expect(toolbar.scrollWidth).toBeLessThanOrEqual(toolbar.clientWidth + 1);
  expect(refresh.getBoundingClientRect().right).toBeLessThanOrEqual(
    toolbar.getBoundingClientRect().right + 1
  );
  const highlightedCommand = screen.getByRole("region", {
    name: "Dump schema only command",
  });
  const reproduceCard = screen
    .getByRole("heading", { name: "Reproduce locally" })
    .closest<HTMLElement>('[data-slot="card"]');
  const definitionFlow = reproduceCard?.parentElement;
  if (!(reproduceCard && definitionFlow)) {
    throw new Error("Expected the highlighted definition flow to render.");
  }
  expect(definitionFlow.scrollWidth).toBeLessThanOrEqual(
    definitionFlow.clientWidth + 1
  );
  expect(highlightedCommand.scrollWidth).toBeGreaterThan(
    highlightedCommand.clientWidth
  );
  expect(getComputedStyle(highlightedCommand).overflowX).toBe("auto");
  expect(document.activeElement).not.toBe(highlightedCommand);
});

test("data explorer definition commands are keyboard reachable", async () => {
  await renderTable(CHANGE_LOG_DEFINITION_SCHEMA, "change_log", {
    tab: "definition",
    width: "w-[420px]",
  });

  await expect
    .element(page.getByRole("heading", { name: "Reproduce locally" }))
    .toBeVisible();
  const highlightedCommand = screen.getByRole("region", {
    name: "Dump schema only command",
  });
  expect(highlightedCommand.scrollWidth).toBeGreaterThan(
    highlightedCommand.clientWidth
  );
  await page
    .getByRole("button", { name: "Copy dump schema only command" })
    .press("Tab");
  expect(document.activeElement).toBe(highlightedCommand);
});

test("data explorer index table stays inside narrow surfaces", async () => {
  await renderTable(customersSchema(), "customers", {
    tab: "indexes",
    width: "w-[560px]",
  });

  await expect.element(page.getByText("btree").first()).toBeVisible();
  // Long definitions no longer render as SQL blocks; the Columns cell
  // truncates and keeps the full text in its title, and the CREATE INDEX SQL
  // moves into the per-row copy button value.
  const columnsCell = screen.getByTitle(
    "(status, account_id) INCLUDE (last_seen_at)"
  );
  const tableContainer = columnsCell.closest('[data-slot="table-container"]');
  const frame = screen.getByTestId("screenshot-frame");

  if (!(tableContainer && frame)) {
    throw new Error("Expected the index table to render inside the frame.");
  }

  expect(tableContainer.getBoundingClientRect().right).toBeLessThanOrEqual(
    frame.getBoundingClientRect().right + 1
  );
  await expect
    .element(page.getByRole("button", { name: "Copy CREATE INDEX SQL" }))
    .toHaveCount(2);
});

test("data explorer table columns explain PostgreSQL type semantics", async () => {
  await renderTable(
    customersSchema({
      columns: ordered(
        column("event_time", [DataType.TIMESTAMP, "timestamp with time zone"]),
        column("amount", [DataType.FLOAT, "numeric"]),
        column("retry_count", [DataType.INTEGER, "bigint"]),
        column("metadata", [DataType.JSON, "jsonb"], { isNullable: true })
      ),
    }),
    "customers",
    "columns"
  );

  await expect.element(page.getByText("event_time")).toBeVisible();
  expect(requireColumnTypeTitle("timestamp with time zone")).toMatch(
    TIMESTAMPTZ_TYPE_TITLE_RE
  );
  expect(requireColumnTypeTitle("numeric")).toMatch(NUMERIC_TYPE_TITLE_RE);
  expect(requireColumnTypeTitle("bigint")).toMatch(BIGINT_TYPE_TITLE_RE);
  expect(requireColumnTypeTitle("jsonb")).toMatch(JSONB_TYPE_TITLE_RE);
});

test("data explorer table empty resource tabs use shared empty panels", async () => {
  await renderTable(
    customersSchema({
      constraints: [],
      indexes: [],
      policies: [],
      triggers: [],
    }),
    "customers",
    "indexes"
  );

  await expect
    .element(page.getByRole("heading", { name: "No indexes" }))
    .toBeVisible();
  await expect
    .element(
      page.getByText(
        "This table does not define secondary or primary-key indexes in the current catalog snapshot."
      )
    )
    .toBeVisible();
  expect(
    document.querySelector(
      '[data-empty-category="indexes"] [data-slot="empty-state-panel"]'
    )
  ).not.toBeNull();
  expect(
    document.querySelector(
      '[data-empty-category="indexes"] [data-slot="empty-icon"] svg'
    )
  ).toBeNull();

  await page.getByRole("tab", { exact: true, name: "Constraints 0" }).click();
  await expect
    .element(page.getByRole("heading", { name: "No constraints" }))
    .toBeVisible();
  expect(
    document.querySelector(
      '[data-empty-category="constraints"] [data-slot="empty-state-panel"]'
    )
  ).not.toBeNull();

  await page.getByRole("tab", { exact: true, name: "Policies 0" }).click();
  await expect
    .element(page.getByRole("heading", { name: "No policies" }))
    .toBeVisible();
  expect(
    document.querySelector(
      '[data-empty-category="policies"] [data-slot="empty-state-panel"]'
    )
  ).not.toBeNull();
  await expect
    .element(page.getByText("How the server combines these"))
    .not.toBeAttached();
  await expect
    .element(page.getByText("Preview visibility as"))
    .not.toBeAttached();

  await page.getByRole("tab", { exact: true, name: "Triggers 0" }).click();
  await expect
    .element(page.getByRole("heading", { name: "No triggers" }))
    .toBeVisible();
  expect(
    document.querySelector(
      '[data-empty-category="triggers"] [data-slot="empty-state-panel"]'
    )
  ).not.toBeNull();

  await page.getByRole("tab", { exact: true, name: "Partitions" }).click();
  await expect
    .element(page.getByRole("heading", { name: "Table is not partitioned" }))
    .toBeVisible();
  expect(
    document.querySelector(
      '[data-empty-category="partitions"] [data-slot="empty-state-panel"]'
    )
  ).not.toBeNull();
});

test("data explorer table partitions matches the imported redesign fixture", async () => {
  rs.setSystemTime(PARTITION_REDESIGN_FETCHED_AT);
  await renderTable(changeLogPartitionsSchema(), "change_log", "partitions");

  await expect
    .element(page.getByText("PostgreSQL statistics"))
    .not.toBeAttached();
  await expect
    .element(page.getByText("4 partitions · pruning on", { exact: false }))
    .not.toBeAttached();
  await expect
    .element(page.getByRole("button", { exact: true, name: "Refresh" }))
    .not.toBeAttached();
  await expect
    .element(page.getByRole("heading", { name: "Rows per partition" }))
    .not.toBeAttached();
  await expect
    .element(page.getByText("Partitioned by", { exact: false }))
    .toBeVisible();
  await expect.element(page.getByText("RANGE (recorded_at)")).toBeVisible();
  await expect
    .element(page.getByRole("row", { name: PARTITION_Q1_ROW_RE }))
    .toBeVisible();
  await expect
    .element(page.getByRole("row", { name: PARTITION_Q2_ROW_RE }))
    .toBeVisible();
  await expect
    .element(page.getByRole("row", { name: PARTITION_Q3_ROW_RE }))
    .toBeVisible();
  await expect
    .element(page.getByRole("row", { name: PARTITION_DEFAULT_ROW_RE }))
    .toBeVisible();
  await expect.element(page.getByText("2026-01-01 → 2026-04-01")).toBeVisible();
  await expect
    .element(page.getByRole("button", { exact: true, name: "Schema" }))
    .not.toBeAttached();
  await expect
    .element(page.getByRole("button", { exact: true, name: "Bound kind" }))
    .not.toBeAttached();

  await page
    .getByRole("textbox", { name: "Search partitions…" })
    .fill("archive");
  await expect
    .element(page.getByRole("row", { name: PARTITION_Q1_ROW_RE }))
    .not.toBeAttached();
  await expect
    .element(page.getByRole("row", { name: PARTITION_DEFAULT_ROW_RE }))
    .toBeVisible();
  await page.getByRole("textbox", { name: "Search partitions…" }).fill("");
  await expect
    .element(page.getByRole("row", { name: PARTITION_Q1_ROW_RE }))
    .toBeVisible();
  await expect
    .element(page.getByRole("combobox", { name: "Rows per page" }))
    .not.toBeAttached();
  await expect
    .element(
      page.getByText("The DEFAULT partition holds 46%", { exact: false })
    )
    .toBeVisible();
});

test("data explorer table partitions paginate large partition lists", async () => {
  rs.setSystemTime(PARTITION_REDESIGN_FETCHED_AT);
  const months = Array.from({ length: 12 }, (_, index) => {
    const month = index + 1;
    const nextMonth = month === 12 ? 1 : month + 1;
    const nextYear = month === 12 ? 2027 : 2026;
    const pad = (value: number) => String(value).padStart(2, "0");
    return changeLogPartition(`2026_m${pad(month)}`, {
      estimatedRows: BigInt(month * 1000),
      partitionBound: `FOR VALUES FROM ('2026-${pad(month)}-01') TO ('${nextYear}-${pad(nextMonth)}-01')`,
      sizeBytes: BigInt(month * 1024 * 1024),
    });
  });
  await renderTable(
    changeLogPartitionsSchema(months),
    "change_log",
    "partitions"
  );

  await expect
    .element(page.getByRole("combobox", { name: "Rows per page" }))
    .toBeVisible();
  await expect.element(page.getByText(PARTITION_PAGE_ONE_RE)).toBeVisible();
  await expect.element(page.getByText("change_log_2026_m01")).toBeVisible();
  await expect
    .element(page.getByText("change_log_2026_m11"))
    .not.toBeAttached();

  await page.getByRole("button", { name: "Next page" }).click();
  await expect.element(page.getByText(PARTITION_PAGE_TWO_RE)).toBeVisible();
  await expect.element(page.getByText("change_log_2026_m11")).toBeVisible();
  await expect
    .element(page.getByText("change_log_2026_m01"))
    .not.toBeAttached();

  await page.getByRole("combobox", { name: "Rows per page" }).click();
  await page.getByRole("option", { exact: true, name: "25" }).click();
  await expect.element(page.getByText(PARTITION_PAGE_ALL_RE)).toBeVisible();
  await expect.element(page.getByText("change_log_2026_m01")).toBeVisible();
  await expect.element(page.getByText("change_log_2026_m11")).toBeVisible();
});

test("data explorer table child partition shows parent metadata", async () => {
  await renderTable(CHILD_PARTITION_SCHEMA, "events_2024", "partitions");

  await expect.element(page.getByText("Partition bound")).toBeVisible();
  await expect.element(page.getByText("Parent table")).toBeVisible();
  await expect
    .element(page.getByText("analytics.events", { exact: true }))
    .toBeVisible();
  await expect.element(page.getByText(PARTITION_2024_BOUND_RE)).toBeVisible();
});
