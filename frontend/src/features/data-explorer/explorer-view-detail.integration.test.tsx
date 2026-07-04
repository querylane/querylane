import { create as createProto } from "@bufbuild/protobuf";
import { cleanup, render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { ViewDetail } from "@/features/data-explorer/explorer-view-detail";
import { ExplainQueryRequest_Format } from "@/protogen/querylane/console/v1alpha1/sql_pb";
import {
  View_ViewType,
  ViewSchema,
} from "@/protogen/querylane/console/v1alpha1/view_pb";

const DATE_TRUNC_PATTERN = /date_trunc/;
const CREATE_VIEW_PATTERN = /CREATE VIEW "public"\."daily_paid_revenue" AS/;

const { useExplainQueryMock } = vi.hoisted(() => ({
  useExplainQueryMock: vi.fn(),
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
});

afterEach(() => {
  cleanup();
});

describe("view detail integration", () => {
  it("shows materialized view storage, population, owner, and comment", () => {
    render(
      <ViewDetail
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
    expect(screen.getByText("Materialized view")).toBeTruthy();
    expect(screen.getByText("owner: analytics_owner")).toBeTruthy();
    expect(screen.getByText("4 KB")).toBeTruthy();
    expect(screen.getByText("Yes")).toBeTruthy();
    expect(screen.getByText("Precomputed daily revenue totals")).toBeTruthy();
  });

  it("explains a view with purpose, sources, query shape, and SQL definition", () => {
    const { container } = render(
      <ViewDetail
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
    expect(screen.getByText("View")).toBeTruthy();
    expect(screen.getByText("owner: app_owner")).toBeTruthy();
    expect(screen.queryByText("Populated")).toBeNull();
    expect(screen.queryByText("Size")).toBeNull();
  });
});
