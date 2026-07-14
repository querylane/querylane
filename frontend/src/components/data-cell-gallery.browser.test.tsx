import { create as createProto } from "@bufbuild/protobuf";
import { expect, test } from "vitest";
import { page } from "vitest/browser";
import { render } from "vitest-browser-react";
import { ScreenshotFrame } from "@/__tests__/browser-test-utils";
import { DataCell } from "@/components/data-grid/table-data-grid/data-cell";
import { StatusIndicator } from "@/components/ui/status-indicator";
import {
  TableCellSchema,
  TableResultColumnSchema,
  type TableValue,
  TableValueSchema,
} from "@/protogen/querylane/console/v1alpha1/table_data_pb";
import { DataType } from "@/protogen/querylane/console/v1alpha1/table_pb";

const TEST_NUMBER_3 = 3;
const TEST_NUMBER_4 = 4;

const EXAMPLE_COLUMNS = [
  { columnName: "Text", dataType: DataType.STRING },
  { columnName: "Integer", dataType: DataType.INTEGER },
  { columnName: "Numeric", dataType: DataType.FLOAT },
  { columnName: "Boolean", dataType: DataType.BOOLEAN },
  { columnName: "JSON", dataType: DataType.JSON },
  { columnName: "Bytes", dataType: DataType.BINARY },
  { columnName: "Timestamp", dataType: DataType.TIMESTAMP },
  { columnName: "Date", dataType: DataType.DATE },
  { columnName: "Null", dataType: DataType.STRING },
] as const;

function column(name: string, dataType: DataType) {
  return createProto(TableResultColumnSchema, {
    columnName: name,
    dataType,
    isNullable: true,
    mayTruncate: true,
    rawType: DataType[dataType]?.toLowerCase() ?? "unknown",
  });
}

function cell(kind: TableValue["kind"], options = {}) {
  return createProto(TableCellSchema, {
    ...options,
    value: createProto(TableValueSchema, { kind }),
  });
}

const EXAMPLE_CELLS = [
  cell(
    {
      case: "stringValue",
      value: "customer@example.com with a very long preview value",
    },
    { truncated: true }
  ),
  cell({ case: "int64Value", value: 123_456_789n }),
  cell({ case: "numericValue", value: "98123.45001" }),
  cell({ case: "boolValue", value: true }),
  cell(
    { case: "jsonValue", value: '{"plan":"enterprise","active":true}' },
    { truncated: true }
  ),
  cell(
    {
      case: "bytesValue",
      value: new Uint8Array([1, 2, TEST_NUMBER_3, TEST_NUMBER_4]),
    },
    { fullSizeBytes: 4096n, truncated: true }
  ),
  cell({ case: "timestampValue", value: "2026-05-20T11:45:00Z" }),
  cell({ case: "timestampValue", value: "2026-05-20" }),
  cell({ case: "nullValue", value: 0 }),
];

function renderCellGallery() {
  render(
    <ScreenshotFrame>
      <div className="w-[1100px] rounded-2xl border border-border bg-background p-8 text-foreground">
        <div className="space-y-6">
          <div>
            <h1 className="font-semibold text-2xl">{"Data cell rendering"}</h1>
            <p className="mt-1 text-muted-foreground text-sm">
              {
                "Typed PostgreSQL values should stay aligned, scannable, and visibly distinct."
              }
            </p>
          </div>
          <div className="overflow-hidden rounded-xl border border-border">
            <div className="grid grid-cols-[180px_minmax(0,1fr)] border-border border-b bg-muted/30 px-4 py-3 font-medium text-muted-foreground text-xs uppercase tracking-wide">
              <div>{"Type"}</div>
              <div>{"Rendered value"}</div>
            </div>
            {EXAMPLE_COLUMNS.map((example, index) => (
              <div
                className="grid grid-cols-[180px_minmax(0,1fr)] items-center border-border border-b px-4 py-3 last:border-b-0"
                key={example.columnName}
              >
                <div className="text-muted-foreground text-sm">
                  {example.columnName}
                </div>
                <div className="flex min-w-0 items-center rounded-md bg-card px-3 py-2 text-left text-sm">
                  <DataCell
                    cell={EXAMPLE_CELLS[index]}
                    column={column(example.columnName, example.dataType)}
                    jsonDisplay="expanded"
                  />
                </div>
              </div>
            ))}
          </div>
          <div className="flex gap-4 rounded-xl border border-border bg-card p-4 text-sm">
            <StatusIndicator status="connected" />
            <StatusIndicator status="disconnected" />
            <StatusIndicator status="error" />
          </div>
        </div>
      </div>
    </ScreenshotFrame>
  );
}

test("data grid cells distinguish text, numeric, boolean, json, bytes, date, and null values", async () => {
  renderCellGallery();

  await expect.element(page.getByText("Data cell rendering")).toBeVisible();
  await expect.element(page.getByText("123456789")).toBeVisible();
  await expect.element(page.getByText("NULL", { exact: true })).toBeVisible();
  await expect
    .element(page.getByText("Connected", { exact: true }))
    .toBeVisible();
  await expect(page.getByTestId("screenshot-frame")).toMatchScreenshot(
    "data-cell-gallery"
  );
});
