import { create as createProto } from "@bufbuild/protobuf";
import { cleanup, render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { ViewDetail } from "@/features/data-explorer/explorer-view-detail";
import { ExplainQueryRequest_Format } from "@/protogen/querylane/console/v1alpha1/sql_pb";
import {
  ListTableColumnsResponseSchema,
  ListTableConstraintsResponseSchema,
  ListTableIndexesResponseSchema,
  TableIndexSchema,
} from "@/protogen/querylane/console/v1alpha1/table_pb";
import {
  ListViewDependenciesResponseSchema,
  RefreshMaterializedViewMode,
  View_ViewType,
  ViewDependency_Direction,
  ViewDependency_RelationType,
  ViewDependencySchema,
  ViewSchema,
} from "@/protogen/querylane/console/v1alpha1/view_pb";

const DATE_TRUNC_PATTERN = /date_trunc/;
const CREATE_VIEW_PATTERN = /CREATE VIEW "public"\."daily_paid_revenue" AS/;
const COLUMNS_TAB_PATTERN = /Columns/;
const DEPENDENCIES_TAB_PATTERN = /Dependencies/;
const INDEXES_TAB_PATTERN = /Indexes/;
const SALES_ORDERS_PATTERN = /sales\.orders/;

const { tableApi, useExplainQueryMock, viewApi } = vi.hoisted(() => ({
  tableApi: {
    columns: {
      data: undefined as unknown,
      error: null as Error | null,
      isLoading: false,
      refetch: vi.fn(),
    },
    constraints: {
      data: undefined as unknown,
      error: null as Error | null,
      isLoading: false,
      refetch: vi.fn(),
    },
    indexes: {
      data: undefined as unknown,
      error: null as Error | null,
      isLoading: false,
      refetch: vi.fn(),
    },
  },
  useExplainQueryMock: vi.fn(),
  viewApi: {
    dependencies: {
      data: undefined as unknown,
      error: null as Error | null,
      fetchNextPage: vi.fn(),
      hasNextPage: false,
      isFetchingNextPage: false,
      isLoading: false,
      refetch: vi.fn(),
    },
    refresh: {
      error: null as Error | null,
      isPending: false,
      mutateAsync: vi.fn(),
      reset: vi.fn(),
    },
  },
}));

vi.mock("@tanstack/react-router", () => ({
  Link: ({
    children,
    className,
  }: {
    children: React.ReactNode;
    className?: string | undefined;
  }) => (
    <a className={className} href="#dependency">
      {children}
    </a>
  ),
}));

vi.mock("@/components/data-grid/table-data-grid/table-data-grid", () => ({
  TableDataGrid: ({
    children,
  }: {
    children?: (state: {
      grid: React.ReactNode;
      lastFetchedLabel: string;
    }) => React.ReactNode;
  }) => {
    const grid = <div>Materialized rows</div>;
    return children
      ? children({ grid, lastFetchedLabel: "Last fetched just now" })
      : grid;
  },
}));

vi.mock("@/hooks/api/table", () => ({
  useListTableColumnsQuery: () => tableApi.columns,
  useListTableConstraintsQuery: () => tableApi.constraints,
  useListTableIndexesQuery: () => tableApi.indexes,
}));

vi.mock("@/hooks/api/view", () => ({
  useListViewDependenciesQuery: () => viewApi.dependencies,
  useRefreshMaterializedViewMutation: () => viewApi.refresh,
}));

vi.mock("@/hooks/api/sql", () => ({
  useExplainQuery: useExplainQueryMock,
}));

beforeEach(() => {
  useExplainQueryMock.mockReset();
  useExplainQueryMock.mockReturnValue({
    data: undefined,
    error: null,
    isFetching: false,
  });
  tableApi.columns.data = createProto(ListTableColumnsResponseSchema, {
    columns: [],
  });
  tableApi.columns.error = null;
  tableApi.columns.isLoading = false;
  tableApi.constraints.data = createProto(ListTableConstraintsResponseSchema, {
    constraints: [],
  });
  tableApi.constraints.error = null;
  tableApi.constraints.isLoading = false;
  tableApi.indexes.data = createProto(ListTableIndexesResponseSchema, {
    indexes: [
      createProto(TableIndexSchema, {
        indexName: "daily_revenue_refresh_idx",
        isUnique: true,
        isValid: true,
        keyColumns: ["day"],
      }),
    ],
  });
  tableApi.indexes.error = null;
  tableApi.indexes.isLoading = false;
  viewApi.dependencies.data = {
    pages: [
      createProto(ListViewDependenciesResponseSchema, {
        viewDependencies: [
          createProto(ViewDependencySchema, {
            direction: ViewDependency_Direction.UPSTREAM,
            displayName: "orders",
            name: "instances/prod/databases/app/schemas/public/views/daily_revenue/viewDependencies/edge",
            relation:
              "instances/prod/databases/app/schemas/sales/tables/orders",
            relationType: ViewDependency_RelationType.TABLE,
            schemaName: "sales",
          }),
        ],
      }),
    ],
  };
  viewApi.dependencies.fetchNextPage.mockReset();
  viewApi.dependencies.fetchNextPage.mockResolvedValue({});
  viewApi.dependencies.hasNextPage = false;
  viewApi.dependencies.isFetchingNextPage = false;
  viewApi.refresh.error = null;
  viewApi.refresh.isPending = false;
  viewApi.refresh.mutateAsync.mockReset();
  viewApi.refresh.mutateAsync.mockResolvedValue({});
  viewApi.refresh.reset.mockReset();
});

afterEach(() => {
  cleanup();
});

describe("view detail integration", () => {
  it("marks materialized view actions read-only when mutations are disabled", () => {
    render(
      <ViewDetail
        mutationsAllowed={false}
        view={createProto(ViewSchema, {
          displayName: "daily_revenue",
          name: "instances/prod/databases/app/schemas/public/views/daily_revenue",
          viewType: View_ViewType.MATERIALIZED,
        })}
        viewName="daily_revenue"
      />
    );

    expect(screen.getByText("Read-only")).toBeTruthy();
    expect(
      screen.getByRole<HTMLButtonElement>("button", {
        name: "Refresh materialized view",
      }).disabled
    ).toBe(true);
  });

  it("shows materialized view storage, population, owner, and comment", () => {
    render(
      <ViewDetail
        mutationsAllowed={true}
        view={createProto(ViewSchema, {
          comment: "Precomputed daily revenue totals",
          displayName: "daily_revenue",
          isPopulated: true,
          name: "instances/prod/databases/app/schemas/public/views/daily_revenue",
          owner: "analytics_owner",
          sizeBytes: 4096n,
          viewType: View_ViewType.MATERIALIZED,
        })}
        viewName="daily_revenue"
      />
    );

    expect(screen.getByRole("heading", { name: "daily_revenue" })).toBeTruthy();
    expect(
      screen.getByText("Materialized view · owner: analytics_owner")
    ).toBeTruthy();
    expect(screen.getByText("4 KB")).toBeTruthy();
    expect(screen.getByText("Yes")).toBeTruthy();
    expect(screen.getByText("Precomputed daily revenue totals")).toBeTruthy();
  });

  it("operates a materialized view through data, metadata, dependencies, definition, and refresh", async () => {
    const user = userEvent.setup();
    const name =
      "instances/prod/databases/app/schemas/public/views/daily_revenue";
    render(
      <ViewDetail
        databaseId="app"
        instanceId="prod"
        mutationsAllowed={true}
        schemaName="public"
        view={createProto(ViewSchema, {
          definition: "SELECT day, total FROM sales.orders",
          displayName: "daily_revenue",
          isPopulated: true,
          name,
          rowCount: 42n,
          sizeBytes: 8192n,
          viewType: View_ViewType.MATERIALIZED,
        })}
        viewName="daily_revenue"
      />
    );

    expect(screen.getByRole("tab", { name: "Data" })).toBeTruthy();
    expect(screen.getByRole("tab", { name: COLUMNS_TAB_PATTERN })).toBeTruthy();
    expect(screen.getByRole("tab", { name: INDEXES_TAB_PATTERN })).toBeTruthy();
    expect(
      screen.getByRole("tab", { name: DEPENDENCIES_TAB_PATTERN })
    ).toBeTruthy();
    expect(screen.getByRole("tab", { name: "Definition" })).toBeTruthy();
    expect(screen.getByText("Concurrent ready")).toBeTruthy();
    expect(screen.getByText("Materialized rows")).toBeTruthy();
    expect(screen.queryByRole("heading", { name: "Purpose" })).toBeNull();

    await user.click(
      screen.getByRole("tab", { name: DEPENDENCIES_TAB_PATTERN })
    );
    expect(
      screen.getByRole("link", { name: SALES_ORDERS_PATTERN })
    ).toBeTruthy();
    expect(screen.getByText("Upstream")).toBeTruthy();

    await user.click(
      screen.getByRole("button", { name: "Refresh materialized view" })
    );
    expect(
      screen.getByRole("heading", { name: "Refresh daily_revenue" })
    ).toBeTruthy();
    expect(screen.getByText("42 estimated rows · 8 KB")).toBeTruthy();
    const confirmation = screen.getByRole("textbox", {
      name: 'Type "public"."daily_revenue" to confirm',
    });
    expect(
      screen.getByRole<HTMLButtonElement>("button", {
        name: "Refresh concurrently",
      }).disabled
    ).toBe(true);
    await user.click(confirmation);
    await user.paste('"public"."daily_revenue"');
    await user.click(
      screen.getByRole("button", { name: "Refresh concurrently" })
    );
    expect(viewApi.refresh.mutateAsync).toHaveBeenCalledWith(
      expect.objectContaining({
        mode: RefreshMaterializedViewMode.CONCURRENT,
        name,
        confirmation: '"public"."daily_revenue"',
        signal: expect.any(AbortSignal),
      }),
      expect.objectContaining({ onError: expect.any(Function) })
    );
  });

  it("keeps unpopulated views read-safe and disables concurrent refresh", async () => {
    const user = userEvent.setup();
    render(
      <ViewDetail
        databaseId="app"
        instanceId="prod"
        mutationsAllowed={true}
        schemaName="public"
        view={createProto(ViewSchema, {
          displayName: "empty_rollup",
          isPopulated: false,
          name: "instances/prod/databases/app/schemas/public/views/empty_rollup",
          viewType: View_ViewType.MATERIALIZED,
        })}
        viewName="empty_rollup"
      />
    );

    expect(screen.getByText("No stored rows")).toBeTruthy();
    expect(
      screen.getByText(
        "Refresh this materialized view before reading its stored rows."
      )
    ).toBeTruthy();
    expect(screen.getByText("Standard only")).toBeTruthy();
    expect(screen.queryByText("Materialized rows")).toBeNull();

    await user.click(
      screen.getByRole("button", { name: "Refresh materialized view" })
    );
    expect(
      screen.queryByRole("button", { name: "Refresh concurrently" })
    ).toBeNull();
    expect(screen.getByText("0 estimated rows · 0 B")).toBeTruthy();
    expect(
      screen.getByRole<HTMLButtonElement>("button", {
        name: "Refresh normally",
      }).disabled
    ).toBe(true);
  });

  it("loads the next dependency page on demand", async () => {
    const user = userEvent.setup();
    viewApi.dependencies.hasNextPage = true;

    render(
      <ViewDetail
        databaseId="app"
        instanceId="prod"
        mutationsAllowed={true}
        schemaName="public"
        view={createProto(ViewSchema, {
          displayName: "daily_revenue",
          isPopulated: true,
          name: "instances/prod/databases/app/schemas/public/views/daily_revenue",
          viewType: View_ViewType.MATERIALIZED,
        })}
        viewName="daily_revenue"
      />
    );

    await user.click(
      screen.getByRole("tab", { name: DEPENDENCIES_TAB_PATTERN })
    );
    await user.click(
      screen.getByRole("button", { name: "Load more dependencies" })
    );

    expect(viewApi.dependencies.fetchNextPage).toHaveBeenCalledOnce();
  });

  it("does not claim standard-only refresh before index metadata loads", () => {
    tableApi.indexes.data = undefined;
    tableApi.indexes.isLoading = true;

    render(
      <ViewDetail
        mutationsAllowed={true}
        view={createProto(ViewSchema, {
          displayName: "daily_revenue",
          isPopulated: true,
          name: "instances/prod/databases/app/schemas/public/views/daily_revenue",
          viewType: View_ViewType.MATERIALIZED,
        })}
        viewName="daily_revenue"
      />
    );

    expect(screen.getByText("Checking…")).toBeTruthy();
    expect(screen.queryByText("Standard only")).toBeNull();
  });
});

describe("standard view detail integration", () => {
  it("explains a view with purpose, sources, query shape, and SQL definition", () => {
    const { container } = render(
      <ViewDetail
        mutationsAllowed={true}
        view={createProto(ViewSchema, {
          comment: "Paid order revenue by day for finance dashboards",
          definition: `SELECT date_trunc('day', orders.created_at) AS day,
       count(*) AS order_count,
       sum(orders.total) AS gross_revenue
FROM sales.orders
JOIN crm.customers ON customers.id = orders.customer_id
WHERE orders.status = 'paid'
GROUP BY 1;`,
          displayName: "daily_paid_revenue",
          name: "instances/prod/databases/app/schemas/public/views/daily_paid_revenue",
          owner: "analytics_owner",
          rowCount: 42n,
          sizeBytes: 8192n,
          viewType: View_ViewType.STANDARD,
        })}
        viewName="daily_paid_revenue"
      />
    );

    expect(
      screen.getByRole("heading", { name: "daily_paid_revenue" })
    ).toBeTruthy();
    expect(screen.getByRole("heading", { name: "Purpose" })).toBeTruthy();
    expect(
      screen.getByText("Paid order revenue by day for finance dashboards")
    ).toBeTruthy();
    expect(
      screen.getByRole("heading", { name: "Source relations" })
    ).toBeTruthy();
    expect(screen.getByText("sales.orders")).toBeTruthy();
    expect(screen.getByText("crm.customers")).toBeTruthy();
    expect(screen.getByRole("heading", { name: "Query shape" })).toBeTruthy();
    expect(screen.getByText("Aggregates rows")).toBeTruthy();
    expect(screen.getByText("Filters rows")).toBeTruthy();
    expect(screen.getByText("Joins sources")).toBeTruthy();
    expect(
      screen.getByRole("heading", { name: "SQL definition" })
    ).toBeTruthy();
    const sqlCode = container.querySelector("code.language-sql");
    expect(sqlCode?.textContent).toMatch(CREATE_VIEW_PATTERN);
    expect(sqlCode?.textContent).toMatch(DATE_TRUNC_PATTERN);
  });

  it("renders database notices returned while checking the view plan", async () => {
    const user = userEvent.setup();
    useExplainQueryMock.mockReturnValue({
      data: {
        notices: ["NOTICE 00000: planner checked revenue view"],
      },
      error: null,
      isFetching: false,
    });

    render(
      <ViewDetail
        mutationsAllowed={true}
        view={createProto(ViewSchema, {
          definition: "SELECT * FROM sales.orders;",
          displayName: "daily_paid_revenue",
          name: "instances/prod/databases/app/schemas/public/views/daily_paid_revenue",
          owner: "analytics_owner",
          viewType: View_ViewType.STANDARD,
        })}
        viewName="daily_paid_revenue"
      />
    );

    expect(
      screen.queryByRole("heading", { name: "Database notices" })
    ).toBeNull();

    await user.click(
      screen.getByRole("button", { name: "Check database notices" })
    );

    expect(
      screen.getByRole("heading", { name: "Returned notices" })
    ).toBeTruthy();
    expect(
      screen.getByText("NOTICE 00000: planner checked revenue view")
    ).toBeTruthy();
    expect(useExplainQueryMock).toHaveBeenLastCalledWith(
      {
        format: ExplainQueryRequest_Format.TEXT,
        parent: "instances/prod/databases/app",
        statement: 'SELECT * FROM "public"."daily_paid_revenue"',
      },
      expect.objectContaining({ enabled: true })
    );
  });

  it("shows an empty state when returned notices are blank", async () => {
    const user = userEvent.setup();
    useExplainQueryMock.mockReturnValue({
      data: {
        notices: ["   "],
      },
      error: null,
      isFetching: false,
    });

    render(
      <ViewDetail
        mutationsAllowed={true}
        view={createProto(ViewSchema, {
          definition: "SELECT * FROM sales.orders;",
          displayName: "daily_paid_revenue",
          name: "instances/prod/databases/app/schemas/public/views/daily_paid_revenue",
          owner: "analytics_owner",
          viewType: View_ViewType.STANDARD,
        })}
        viewName="daily_paid_revenue"
      />
    );

    await user.click(
      screen.getByRole("button", { name: "Check database notices" })
    );

    expect(screen.getByText("No database notices returned.")).toBeTruthy();
    expect(
      screen.queryByRole("heading", { name: "Returned notices" })
    ).toBeNull();
  });

  it("keeps standard views focused on metadata without materialized stats", () => {
    render(
      <ViewDetail
        mutationsAllowed={true}
        view={createProto(ViewSchema, {
          displayName: "active_accounts",
          name: "instances/prod/databases/app/schemas/public/views/active_accounts",
          owner: "app_owner",
          viewType: View_ViewType.STANDARD,
        })}
        viewName="active_accounts"
      />
    );

    expect(
      screen.getByRole("heading", { name: "active_accounts" })
    ).toBeTruthy();
    expect(screen.getByText("View · owner: app_owner")).toBeTruthy();
    expect(screen.queryByText("Populated")).toBeNull();
    expect(screen.queryByText("Size")).toBeNull();
  });
});
