import { create as createProto } from "@bufbuild/protobuf";
import { page } from "@rstest/browser";
import { render } from "@rstest/browser-react";
import { expect, rs, test } from "@rstest/core";
import { ScreenshotFrame } from "@/__tests__/browser-test-utils";
import { TableDetail } from "@/features/data-explorer/explorer-table-detail";
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
  DataType,
  GetTablePartitionMetadataResponseSchema,
  ListTableColumnsResponseSchema,
  ListTableConstraintsResponseSchema,
  ListTableIndexesResponseSchema,
  ListTablePoliciesResponseSchema,
  ListTableTriggersResponseSchema,
} from "@/protogen/querylane/console/v1alpha1/table_pb";

import "@/components/data-grid/table-data-grid/data-grid-theme.css";

const metadataQuery = (data: unknown) => ({
  data,
  dataUpdatedAt: Date.UTC(2026, 4, 20, 11, 30),
  error: null,
  isFetching: false,
  isLoading: false,
  refetch: rs.fn(),
});

const tableApi = rs.hoisted(() => ({
  useGetTablePartitionMetadataQuery: rs.fn(),
  useListTableColumnsQuery: rs.fn(),
  useListTableConstraintsQuery: rs.fn(),
  useListTableIndexesQuery: rs.fn(),
  useListTablePoliciesQuery: rs.fn(),
  useListTableTriggersQuery: rs.fn(),
}));

const tableDataApi = rs.hoisted(() => ({
  useReadCellValueMutation: rs.fn(() => ({
    isError: false,
    isPending: false,
    mutate: rs.fn(),
  })),
  useReadRowsQuery: rs.fn(),
  useReadRowsQueryActions: rs.fn(() => ({
    fetch: rs.fn(() => Promise.resolve()),
    getState: rs.fn(() => ({ fetchStatus: "idle", status: "success" })),
    prefetch: rs.fn(),
  })),
  useStreamRowsExporter: rs.fn(() => rs.fn()),
}));

rs.mock("@/hooks/api/table", () => ({
  useGetTablePartitionMetadataQuery: tableApi.useGetTablePartitionMetadataQuery,
  useListTableColumnsQuery: tableApi.useListTableColumnsQuery,
  useListTableConstraintsQuery: tableApi.useListTableConstraintsQuery,
  useListTableIndexesQuery: tableApi.useListTableIndexesQuery,
  useListTablePoliciesQuery: tableApi.useListTablePoliciesQuery,
  useListTableTriggersQuery: tableApi.useListTableTriggersQuery,
}));

rs.mock("@/hooks/api/table-data", () => ({
  useReadCellValueMutation: tableDataApi.useReadCellValueMutation,
  useReadRowsQuery: tableDataApi.useReadRowsQuery,
  useReadRowsQueryActions: tableDataApi.useReadRowsQueryActions,
  useStreamRowsExporter: tableDataApi.useStreamRowsExporter,
}));

const resultColumns = [
  createProto(TableResultColumnSchema, {
    columnName: "id",
    dataType: DataType.STRING,
    isNullable: false,
    rawType: "uuid",
  }),
  createProto(TableResultColumnSchema, {
    columnName: "email",
    dataType: DataType.STRING,
    rawType: "text",
  }),
  createProto(TableResultColumnSchema, {
    columnName: "metadata",
    dataType: DataType.JSON,
    rawType: "jsonb",
  }),
  createProto(TableResultColumnSchema, {
    columnName: "active",
    dataType: DataType.BOOLEAN,
    rawType: "bool",
  }),
  createProto(TableResultColumnSchema, {
    columnName: "last_seen_at",
    dataType: DataType.TIMESTAMP,
    rawType: "timestamptz",
  }),
];

function cell(value: TableValue["kind"]) {
  return createProto(TableCellSchema, {
    value: createProto(TableValueSchema, { kind: value }),
  });
}

function seedTableDetailRows(rowCount = 500) {
  tableApi.useListTableColumnsQuery.mockReturnValue(
    metadataQuery(createProto(ListTableColumnsResponseSchema, { columns: [] }))
  );
  tableApi.useListTableConstraintsQuery.mockReturnValue(
    metadataQuery(createProto(ListTableConstraintsResponseSchema, {}))
  );
  tableApi.useListTableIndexesQuery.mockReturnValue(
    metadataQuery(createProto(ListTableIndexesResponseSchema, {}))
  );
  tableApi.useListTablePoliciesQuery.mockReturnValue(
    metadataQuery(createProto(ListTablePoliciesResponseSchema, {}))
  );
  tableApi.useListTableTriggersQuery.mockReturnValue(
    metadataQuery(createProto(ListTableTriggersResponseSchema, {}))
  );
  tableApi.useGetTablePartitionMetadataQuery.mockReturnValue(
    metadataQuery(createProto(GetTablePartitionMetadataResponseSchema, {}))
  );
  tableDataApi.useReadRowsQuery.mockReturnValue({
    data: createProto(ReadRowsResponseSchema, {
      resultSet: createProto(TableResultSetSchema, {
        columns: resultColumns,
        rows: Array.from({ length: rowCount }, (_, index) =>
          createProto(TableResultRowSchema, {
            rowKey: `row-${index}`,
            values: [
              cell({ case: "stringValue", value: `cst_${index}` }),
              cell({ case: "stringValue", value: `user-${index}@example.com` }),
              cell({ case: "jsonValue", value: `{"index":${index}}` }),
              cell({ case: "boolValue", value: index % 2 === 0 }),
              cell({ case: "timestampValue", value: "2026-05-20T11:30:00Z" }),
            ],
          })
        ),
      }),
    }),
    dataUpdatedAt: Date.UTC(2026, 4, 20, 11, 30),
    error: null,
    isFetching: false,
    isLoading: false,
    isPlaceholderData: false,
    refetch: rs.fn(),
  });
}

test("table detail uses available height while keeping 500-row pages virtualized", async () => {
  seedTableDetailRows(500);

  await render(
    <ScreenshotFrame>
      <div className="flex h-[1600px] w-[1120px] flex-col rounded-2xl border border-border bg-background p-6 text-foreground">
        <TableDetail
          databaseId="app"
          instanceId="prod"
          schemaName="information_schema"
          table={undefined}
          tableName="sql_features"
        />
      </div>
    </ScreenshotFrame>
  );

  await expect.element(page.getByText("user-0@example.com")).toBeVisible();
  expect(
    document.querySelector(".rdg")?.getBoundingClientRect().height ?? 0
  ).toBeGreaterThan(1100);
  await expect
    .poll(() => document.querySelectorAll(".rdg .rdg-row").length)
    .toBeLessThanOrEqual(60);
  expect(
    document.querySelectorAll(".rdg .rdg-cell").length
  ).toBeLessThanOrEqual(420);
  await expect.element(page.getByText("user-499@example.com")).toBeDetached();
});
