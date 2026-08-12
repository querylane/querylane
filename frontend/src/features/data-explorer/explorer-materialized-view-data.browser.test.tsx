import { create } from "@bufbuild/protobuf";
import { expect, test, vi } from "vitest";
import { page } from "vitest/browser";
import { render } from "vitest-browser-react";
import { ScreenshotFrame } from "@/__tests__/browser-test-utils";
import { ViewDetail } from "@/features/data-explorer/explorer-view-detail";
import {
  ReadRowsResponseSchema,
  TableCellSchema,
  TableResultColumnSchema,
  TableResultRowSchema,
  TableResultSetSchema,
  type TableValue,
  TableValueSchema,
} from "@/protogen/querylane/console/v1alpha1/table_data_pb";
import {
  ColumnSchema,
  DataType,
  ListTableColumnsResponseSchema,
  ListTableConstraintsResponseSchema,
  ListTableIndexesResponseSchema,
  TableIndexSchema,
} from "@/protogen/querylane/console/v1alpha1/table_pb";
import {
  View_ViewType,
  ViewSchema,
} from "@/protogen/querylane/console/v1alpha1/view_pb";

const tableApi = vi.hoisted(() => ({
  useListTableColumnsQuery: vi.fn(),
  useListTableConstraintsQuery: vi.fn(),
  useListTableIndexesQuery: vi.fn(),
}));
const tableDataApi = vi.hoisted(() => ({
  useReadCellValueMutation: vi.fn(() => ({
    isError: false,
    isPending: false,
    mutateAsync: vi.fn(),
  })),
  useReadRowsQuery: vi.fn(),
  useReadRowsQueryActions: vi.fn(() => ({
    fetch: vi.fn(() => Promise.resolve()),
    getState: vi.fn(() => undefined),
    prefetch: vi.fn(),
  })),
  useStreamRowsExporter: vi.fn(() => vi.fn()),
}));
const viewApi = vi.hoisted(() => ({
  useListViewDependenciesQuery: vi.fn(() => ({
    data: { pages: [{ viewDependencies: [] }] },
    error: null,
    fetchNextPage: vi.fn(),
    hasNextPage: false,
    isFetchingNextPage: false,
    isLoading: false,
    refetch: vi.fn(),
  })),
  useRefreshMaterializedViewMutation: vi.fn(() => ({
    error: null,
    isPending: false,
    mutateAsync: vi.fn(),
    reset: vi.fn(),
  })),
}));

vi.mock("@/hooks/api/table", () => ({
  useListTableColumnsQuery: tableApi.useListTableColumnsQuery,
  useListTableConstraintsQuery: tableApi.useListTableConstraintsQuery,
  useListTableIndexesQuery: tableApi.useListTableIndexesQuery,
}));

vi.mock("@/hooks/api/table-data", () => ({
  useReadCellValueMutation: tableDataApi.useReadCellValueMutation,
  useReadRowsQuery: tableDataApi.useReadRowsQuery,
  useReadRowsQueryActions: tableDataApi.useReadRowsQueryActions,
  useStreamRowsExporter: tableDataApi.useStreamRowsExporter,
}));

vi.mock("@/hooks/api/view", () => ({
  useListViewDependenciesQuery: viewApi.useListViewDependenciesQuery,
  useRefreshMaterializedViewMutation:
    viewApi.useRefreshMaterializedViewMutation,
}));

function metadataQuery(data: unknown) {
  return {
    data,
    dataUpdatedAt: 1_782_882_000_000,
    error: null,
    isError: false,
    isFetching: false,
    isLoading: false,
    refetch: vi.fn(),
  };
}

function resultColumn(columnName: string, rawType: string, dataType: DataType) {
  return create(TableResultColumnSchema, {
    columnName,
    dataType,
    rawType,
  });
}

function cell(value: TableValue["kind"]) {
  return create(TableCellSchema, {
    value: create(TableValueSchema, { kind: value }),
  });
}

function resultRow({
  accountId,
  accountName,
  healthScore,
  openRisks,
  rowKey,
}: {
  accountId: string;
  accountName: string;
  healthScore: number;
  openRisks: bigint;
  rowKey: string;
}) {
  return create(TableResultRowSchema, {
    rowKey,
    values: [
      cell({ case: "stringValue", value: accountId }),
      cell({ case: "stringValue", value: accountName }),
      cell({ case: "doubleValue", value: healthScore }),
      cell({ case: "int64Value", value: openRisks }),
    ],
  });
}

test("materialized view data tab renders its real grid", async () => {
  const name =
    "instances/prod/databases/app/schemas/public/views/customer_success_daily_rollups";
  const columns = [
    create(ColumnSchema, {
      columnName: "account_id",
      dataType: DataType.UUID,
      isNullable: false,
      ordinalPosition: 1,
      rawType: "uuid",
    }),
    create(ColumnSchema, {
      columnName: "account_name",
      dataType: DataType.STRING,
      isNullable: false,
      ordinalPosition: 2,
      rawType: "text",
    }),
    create(ColumnSchema, {
      columnName: "health_score",
      dataType: DataType.FLOAT,
      isNullable: false,
      ordinalPosition: 3,
      rawType: "numeric",
    }),
    create(ColumnSchema, {
      columnName: "open_risks",
      dataType: DataType.INTEGER,
      isNullable: false,
      ordinalPosition: 4,
      rawType: "integer",
    }),
  ];
  tableApi.useListTableColumnsQuery.mockReturnValue(
    metadataQuery(
      create(ListTableColumnsResponseSchema, {
        columns,
      })
    )
  );
  tableApi.useListTableConstraintsQuery.mockReturnValue(
    metadataQuery(create(ListTableConstraintsResponseSchema))
  );
  tableApi.useListTableIndexesQuery.mockReturnValue(
    metadataQuery(
      create(ListTableIndexesResponseSchema, {
        indexes: [
          create(TableIndexSchema, {
            indexName: "customer_success_daily_rollups_account_idx",
            isUnique: true,
            isValid: true,
            keyColumns: ["account_id"],
            keyParts: ["account_id"],
            method: "btree",
          }),
        ],
      })
    )
  );
  tableDataApi.useReadRowsQuery.mockReturnValue({
    data: create(ReadRowsResponseSchema, {
      resultSet: create(TableResultSetSchema, {
        columns: [
          resultColumn("account_id", "uuid", DataType.UUID),
          resultColumn("account_name", "text", DataType.STRING),
          resultColumn("health_score", "numeric", DataType.FLOAT),
          resultColumn("open_risks", "integer", DataType.INTEGER),
        ],
        rows: [
          resultRow({
            accountId: "0270a57c-e072-4d91-9c84-7b01a905ad0f",
            accountName: "Northwind Labs",
            healthScore: 92.4,
            openRisks: 1n,
            rowKey: "account-1",
          }),
          resultRow({
            accountId: "833e0217-d442-45db-9351-7d8027df20bd",
            accountName: "Acme Operations",
            healthScore: 76.8,
            openRisks: 3n,
            rowKey: "account-2",
          }),
          resultRow({
            accountId: "cc67d320-72d6-4f05-96dd-4d295378c529",
            accountName: "Globex Retail",
            healthScore: 61.2,
            openRisks: 5n,
            rowKey: "account-3",
          }),
        ],
      }),
    }),
    dataUpdatedAt: 1_782_882_000_000,
    error: null,
    isFetching: false,
    isLoading: false,
    isPlaceholderData: false,
    refetch: vi.fn(),
  });

  render(
    <ScreenshotFrame>
      <div className="h-[820px] w-[1180px] rounded-2xl border border-border bg-background p-8 text-foreground">
        <ViewDetail
          databaseId="app"
          instanceId="prod"
          mutationsAllowed={true}
          schemaName="public"
          view={create(ViewSchema, {
            comment:
              "Precomputed customer success metrics for account health dashboards.",
            displayName: "customer_success_daily_rollups",
            isPopulated: true,
            name,
            owner: "analytics_owner",
            rowCount: 8_400_000n,
            sizeBytes: 512_000_000n,
            viewType: View_ViewType.MATERIALIZED,
          })}
          viewName="customer_success_daily_rollups"
        />
      </div>
    </ScreenshotFrame>
  );

  await expect
    .element(
      page.getByRole("heading", {
        name: "public.customer_success_daily_rollups",
      })
    )
    .toBeVisible();
  await expect.element(page.getByText("Northwind Labs")).toBeVisible();
  expect(tableDataApi.useReadRowsQuery).toHaveBeenCalledWith(
    expect.objectContaining({ name }),
    expect.objectContaining({ enabled: true })
  );
  await expect(page.getByTestId("screenshot-frame")).toMatchScreenshot(
    "data-explorer-materialized-view-data-grid"
  );
});
