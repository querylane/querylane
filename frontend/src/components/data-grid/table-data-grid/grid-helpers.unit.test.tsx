import { create as createProto } from "@bufbuild/protobuf";
import { afterEach, describe, expect, rs, test } from "@rstest/core";
import { isValidElement } from "react";
import type { CalculatedColumn, Column } from "react-data-grid";
import { renderToStaticMarkup } from "react-dom/server";
import { toast } from "sonner";
import { writeClipboard } from "@/components/data-grid/table-data-grid/grid-clipboard";
import {
  buildColumn,
  buildPageLabel,
} from "@/components/data-grid/table-data-grid/grid-helpers";
import {
  type GridRow,
  ROW_KEY_FIELD,
} from "@/components/data-grid/table-data-grid/grid-row-model";
import * as tableDataActual from "@/hooks/api/table-data" with {
  rstest: "importActual",
};
import {
  RowCount_Status,
  TableCellSchema,
  TableResultColumnSchema,
  type TableValue,
  TableValueSchema,
} from "@/protogen/querylane/console/v1alpha1/table_data_pb";
import { DataType } from "@/protogen/querylane/console/v1alpha1/table_pb";

const tableDataApi = rs.hoisted(() => ({
  useReadRowsQueryActions: rs.fn(() => ({
    fetch: rs.fn(() => Promise.resolve()),
    getState: rs.fn(() => ({ fetchStatus: "idle", status: "success" })),
    prefetch: rs.fn(),
  })),
}));

rs.mock("@/hooks/api/table-data", () => ({
  ...tableDataActual,
  useReadRowsQueryActions: tableDataApi.useReadRowsQueryActions,
}));

rs.mock("sonner", () => ({
  toast: {
    error: rs.fn(),
    success: rs.fn(),
  },
}));

function calculatedColumn(column: Column<GridRow>): CalculatedColumn<GridRow> {
  return {
    ...column,
    parent: undefined,
    idx: 0,
    level: 0,
    width: column.width ?? 100,
    minWidth: column.minWidth ?? 10,
    maxWidth: column.maxWidth ?? undefined,
    resizable: column.resizable ?? false,
    sortable: column.sortable ?? false,
    draggable: column.draggable ?? false,
    frozen: column.frozen ?? false,
    renderCell: column.renderCell ?? (() => null),
    renderHeaderCell: column.renderHeaderCell ?? (() => null),
  };
}
function renderTestCell(column: Column<GridRow>, row: GridRow) {
  return column.renderCell?.({
    column: calculatedColumn(column),
    row,
    rowIdx: 0,
    isCellEditable: false,
    tabIndex: 0,
    onRowChange: () => undefined,
  });
}
function renderTestHeader(column: Column<GridRow>) {
  return column.renderHeaderCell?.({
    column: calculatedColumn(column),
    priority: undefined,
    sortDirection: undefined,
    tabIndex: 0,
  });
}

function testColumn(
  columnName = "email",
  dataType = DataType.STRING,
  rawType = "text"
) {
  return createProto(TableResultColumnSchema, {
    columnName,
    dataType,
    rawType,
  });
}

function testValueCell(kind: TableValue["kind"], truncated = false) {
  return createProto(TableCellSchema, {
    truncated,
    value: createProto(TableValueSchema, {
      kind,
    }),
  });
}

const originalClipboardDescriptor = Object.getOwnPropertyDescriptor(
  navigator,
  "clipboard"
);

afterEach(() => {
  rs.mocked(toast.success).mockClear();
  rs.mocked(toast.error).mockClear();
  rs.restoreAllMocks();
  if (originalClipboardDescriptor) {
    Object.defineProperty(navigator, "clipboard", originalClipboardDescriptor);
  } else {
    Reflect.deleteProperty(navigator, "clipboard");
  }
});

describe("grid helpers", () => {
  test("builds page labels from zero-based page index", () => {
    expect(
      buildPageLabel({ pageIndex: 0, pageSize: 50, rowCount: undefined })
    ).toBe("Page 1");
    expect(
      buildPageLabel({
        pageIndex: 1,
        pageSize: 50,
        rowCount: { status: RowCount_Status.AVAILABLE, value: 125n },
      })
    ).toBe("Page 2 of 3");
  });

  test("marks estimated page totals", () => {
    expect(
      buildPageLabel({
        pageIndex: 0,
        pageSize: 25,
        rowCount: { status: RowCount_Status.ESTIMATED, value: 100n },
      })
    ).toBe("Page 1 of ≈4");
  });

  test("renders a plain cell when a composite foreign key filter is incomplete", () => {
    const carrierColumn = testColumn("carrier_id", DataType.INTEGER, "int4");
    const tenantColumn = testColumn("tenant_id", DataType.INTEGER, "int4");
    const column = buildColumn({
      canHide: true,
      column: carrierColumn,
      foreignKeyReferences: [
        {
          sourceColumns: ["carrier_id", "tenant_id"],
          targetColumns: ["id", "tenant_id"],
          targetTableName:
            "instances/prod/databases/app/schemas/public/tables/carriers",
        },
      ],
      isFrozen: false,
      onCopyName: rs.fn(),
      onHide: rs.fn(),
      onSortAsc: rs.fn(),
      onSortDesc: rs.fn(),
      onToggleFreeze: rs.fn(),
      pkColumnSet: new Set(),
      resultColumns: [carrierColumn, tenantColumn],
    });

    const rendered = renderTestCell(column, {
      [ROW_KEY_FIELD]: "row-1",
      cells: new Map([
        ["carrier_id", testValueCell({ case: "int64Value", value: 214n })],
        ["tenant_id", testValueCell({ case: "nullValue", value: 0 })],
      ]),
    });
    const markup = renderToStaticMarkup(<span>{rendered}</span>);

    expect(markup).toContain("214");
    expect(markup).not.toContain("Open carrier_id reference");
  });

  test("caches linkable foreign keys but rejects truncated values", () => {
    const textColumn = testColumn("external_id", DataType.STRING, "text");
    const bytesColumn = testColumn("fingerprint", DataType.BINARY, "bytea");
    const commonArgs = {
      canHide: true,
      isFrozen: false,
      onCopyName: rs.fn(),
      onHide: rs.fn(),
      onSortAsc: rs.fn(),
      onSortDesc: rs.fn(),
      onToggleFreeze: rs.fn(),
      pkColumnSet: new Set<string>(),
    };

    const truncatedTextColumn = buildColumn({
      ...commonArgs,
      column: textColumn,
      foreignKeyReferences: [
        {
          sourceColumns: ["external_id"],
          targetColumns: ["id"],
          targetTableName:
            "instances/prod/databases/app/schemas/public/tables/orders",
        },
      ],
      resultColumns: [textColumn],
    });
    const bytesForeignKeyColumn = buildColumn({
      ...commonArgs,
      column: bytesColumn,
      foreignKeyReferences: [
        {
          sourceColumns: ["fingerprint"],
          targetColumns: ["fingerprint"],
          targetTableName:
            "instances/prod/databases/app/schemas/public/tables/files",
        },
      ],
      resultColumns: [bytesColumn],
    });

    const truncatedMarkup = renderToStaticMarkup(
      <span>
        {renderTestCell(truncatedTextColumn, {
          [ROW_KEY_FIELD]: "row-1",
          cells: new Map([
            [
              "external_id",
              testValueCell({ case: "stringValue", value: "prefix" }, true),
            ],
          ]),
        })}
      </span>
    );
    const bytesRow = {
      [ROW_KEY_FIELD]: "row-2",
      cells: new Map([
        [
          "fingerprint",
          testValueCell({
            case: "bytesValue",
            value: new Uint8Array([1, 2]),
          }),
        ],
      ]),
    };
    const firstBytesCell = renderTestCell(bytesForeignKeyColumn, bytesRow);
    const secondBytesCell = renderTestCell(bytesForeignKeyColumn, bytesRow);
    if (
      !(
        isValidElement<{ preview: unknown }>(firstBytesCell) &&
        isValidElement<{ preview: unknown }>(secondBytesCell)
      )
    ) {
      throw new Error("expected a foreign key cell");
    }
    const bytesMarkup = renderToStaticMarkup(<span>{firstBytesCell}</span>);

    expect(truncatedMarkup).toContain("prefix");
    expect(truncatedMarkup).not.toContain("Open external_id reference");
    expect(bytesMarkup).toContain("‹2 B›");
    expect(bytesMarkup).toContain("Open fingerprint reference");
    expect(firstBytesCell.props.preview).toBe(secondBytesCell.props.preview);
  });

  test("renders a plain cell when a foreign key value cannot survive the reference filter", () => {
    const textColumn = testColumn("external_id", DataType.STRING, "text");
    const doubleColumn = testColumn("weight", DataType.FLOAT, "float8");
    const commonArgs = {
      canHide: true,
      isFrozen: false,
      onCopyName: rs.fn(),
      onHide: rs.fn(),
      onSortAsc: rs.fn(),
      onSortDesc: rs.fn(),
      onToggleFreeze: rs.fn(),
      pkColumnSet: new Set<string>(),
    };

    // Whitespace-only literals are trimmed to empty by the reference
    // incomplete-rule check, so the row filter would be dropped silently.
    const whitespaceColumn = buildColumn({
      ...commonArgs,
      column: textColumn,
      foreignKeyReferences: [
        {
          sourceColumns: ["external_id"],
          targetColumns: ["id"],
          targetTableName:
            "instances/prod/databases/app/schemas/public/tables/orders",
        },
      ],
      resultColumns: [textColumn],
    });
    const nonFiniteColumn = buildColumn({
      ...commonArgs,
      column: doubleColumn,
      foreignKeyReferences: [
        {
          sourceColumns: ["weight"],
          targetColumns: ["weight"],
          targetTableName:
            "instances/prod/databases/app/schemas/public/tables/parcels",
        },
      ],
      resultColumns: [doubleColumn],
    });

    const whitespaceMarkup = renderToStaticMarkup(
      <span>
        {renderTestCell(whitespaceColumn, {
          [ROW_KEY_FIELD]: "row-1",
          cells: new Map([
            ["external_id", testValueCell({ case: "stringValue", value: " " })],
          ]),
        })}
      </span>
    );
    const nonFiniteMarkup = renderToStaticMarkup(
      <span>
        {renderTestCell(nonFiniteColumn, {
          [ROW_KEY_FIELD]: "row-2",
          cells: new Map([
            [
              "weight",
              testValueCell({ case: "doubleValue", value: Number.NaN }),
            ],
          ]),
        })}
      </span>
    );

    expect(whitespaceMarkup).not.toContain("Open external_id reference");
    expect(nonFiniteMarkup).not.toContain("Open weight reference");
  });

  test("renders a frozen indicator in the column header", () => {
    const column = buildColumn({
      canHide: true,
      column: testColumn(),
      isFrozen: true,
      onCopyName: rs.fn(),
      onHide: rs.fn(),
      onSortAsc: rs.fn(),
      onSortDesc: rs.fn(),
      onToggleFreeze: rs.fn(),
      pkColumnSet: new Set(),
    });

    const rendered = renderTestHeader(column);

    expect(renderToStaticMarkup(<span>{rendered}</span>)).toContain(
      "Frozen column"
    );
  });

  test("toasts an error when clipboard API is unavailable", () => {
    Object.defineProperty(navigator, "clipboard", {
      configurable: true,
      value: undefined,
    });

    expect(() => {
      writeClipboard("copy me");
    }).not.toThrow();
    expect(toast.success).not.toHaveBeenCalled();
    expect(toast.error).toHaveBeenCalledWith(
      "Clipboard isn't available in this browser"
    );
  });

  test("toasts success after a clipboard write resolves", async () => {
    const writeText = rs.fn().mockResolvedValue(undefined);
    Object.defineProperty(navigator, "clipboard", {
      configurable: true,
      value: { writeText },
    });

    writeClipboard("copy me");
    await rs.waitFor(() => {
      expect(toast.success).toHaveBeenCalledTimes(1);
    });

    expect(writeText).toHaveBeenCalledWith("copy me");
    expect(toast.success).toHaveBeenCalledWith("Copied", { duration: 1500 });
    expect(toast.error).not.toHaveBeenCalled();
  });

  test("toasts an error when a clipboard write rejects", async () => {
    const writeText = rs.fn().mockRejectedValue(new Error("denied"));
    Object.defineProperty(navigator, "clipboard", {
      configurable: true,
      value: { writeText },
    });

    writeClipboard("copy me");
    await rs.waitFor(() => {
      expect(toast.error).toHaveBeenCalledTimes(1);
    });

    expect(toast.error).toHaveBeenCalledWith("Couldn't copy to clipboard");
    expect(toast.success).not.toHaveBeenCalled();
  });
});
