import { create as createProto } from "@bufbuild/protobuf";
import { renderToStaticMarkup } from "react-dom/server";
import { toast } from "sonner";
import { afterEach, describe, expect, test, vi } from "vitest";
import { writeClipboard } from "@/components/data-grid/table-data-grid/grid-clipboard";
import {
  buildColumn,
  buildPageLabel,
} from "@/components/data-grid/table-data-grid/grid-helpers";
import { ROW_KEY_FIELD } from "@/components/data-grid/table-data-grid/grid-row-model";
import {
  RowCount_Status,
  TableCellSchema,
  TableResultColumnSchema,
  type TableValue,
  TableValueSchema,
} from "@/protogen/querylane/console/v1alpha1/table_data_pb";
import { DataType } from "@/protogen/querylane/console/v1alpha1/table_pb";

const tableDataApi = vi.hoisted(() => ({
  useReadRowsQueryActions: vi.fn(() => ({
    fetch: vi.fn(() => Promise.resolve()),
    getState: vi.fn(() => ({ fetchStatus: "idle", status: "success" })),
    prefetch: vi.fn(),
  })),
}));

vi.mock("@/hooks/api/table-data", async (importOriginal) => {
  const actual =
    await importOriginal<typeof import("@/hooks/api/table-data")>();
  return {
    ...actual,
    useReadRowsQueryActions: tableDataApi.useReadRowsQueryActions,
  };
});

vi.mock("sonner", () => ({
  toast: {
    error: vi.fn(),
    success: vi.fn(),
  },
}));

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

function testCell(value: string) {
  return testValueCell({ case: "stringValue", value });
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
  vi.mocked(toast.success).mockClear();
  vi.mocked(toast.error).mockClear();
  vi.restoreAllMocks();
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

  test("keeps large bigint page totals precise", () => {
    expect(
      buildPageLabel({
        pageIndex: 0,
        pageSize: 2,
        rowCount: {
          status: RowCount_Status.AVAILABLE,
          value: 9_007_199_254_740_993n,
        },
      })
    ).toBe("Page 1 of 4,503,599,627,370,497");
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

  test("builds renderable grid columns around table cells", () => {
    const column = buildColumn({
      column: testColumn(),
      isFrozen: true,
      onCopyName: vi.fn(),
      onSortAsc: vi.fn(),
      onSortDesc: vi.fn(),
      onToggleFreeze: vi.fn(),
      pkColumnSet: new Set(["email"]),
      sortDirection: "ASC",
      sortPriority: 1,
    });

    expect(column.key).toBe("email");
    expect(column.frozen).toBe(true);
    expect(column.width).toBe("auto");

    const rendered = column.renderCell?.({
      row: {
        [ROW_KEY_FIELD]: "row-1",
        cells: new Map([["email", testCell("owner@example.com")]]),
      },
    } as never);
    expect(renderToStaticMarkup(<span>{rendered}</span>)).toContain(
      "owner@example.com"
    );
  });

  test("renders a plain cell when a composite foreign key filter is incomplete", () => {
    const carrierColumn = testColumn("carrier_id", DataType.INTEGER, "int4");
    const tenantColumn = testColumn("tenant_id", DataType.INTEGER, "int4");
    const column = buildColumn({
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
      onCopyName: vi.fn(),
      onSortAsc: vi.fn(),
      onSortDesc: vi.fn(),
      onToggleFreeze: vi.fn(),
      pkColumnSet: new Set(),
      resultColumns: [carrierColumn, tenantColumn],
    });

    const rendered = column.renderCell?.({
      row: {
        [ROW_KEY_FIELD]: "row-1",
        cells: new Map([
          ["carrier_id", testValueCell({ case: "int64Value", value: 214n })],
          ["tenant_id", testValueCell({ case: "nullValue", value: 0 })],
        ]),
      },
    } as never);
    const markup = renderToStaticMarkup(<span>{rendered}</span>);

    expect(markup).toContain("214");
    expect(markup).not.toContain("Open carrier_id reference");
  });

  test("links exact binary foreign keys but rejects truncated values", () => {
    const textColumn = testColumn("external_id", DataType.STRING, "text");
    const bytesColumn = testColumn("fingerprint", DataType.BINARY, "bytea");
    const commonArgs = {
      isFrozen: false,
      onCopyName: vi.fn(),
      onSortAsc: vi.fn(),
      onSortDesc: vi.fn(),
      onToggleFreeze: vi.fn(),
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
        {truncatedTextColumn.renderCell?.({
          row: {
            [ROW_KEY_FIELD]: "row-1",
            cells: new Map([
              [
                "external_id",
                testValueCell({ case: "stringValue", value: "prefix" }, true),
              ],
            ]),
          },
        } as never)}
      </span>
    );
    const bytesMarkup = renderToStaticMarkup(
      <span>
        {bytesForeignKeyColumn.renderCell?.({
          row: {
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
          },
        } as never)}
      </span>
    );

    expect(truncatedMarkup).toContain("prefix");
    expect(truncatedMarkup).not.toContain("Open external_id reference");
    expect(bytesMarkup).toContain("bytes");
    expect(bytesMarkup).toContain("Open fingerprint reference");
  });

  test("renders a plain cell when a foreign key value cannot survive the reference filter", () => {
    const textColumn = testColumn("external_id", DataType.STRING, "text");
    const doubleColumn = testColumn("weight", DataType.FLOAT, "float8");
    const commonArgs = {
      isFrozen: false,
      onCopyName: vi.fn(),
      onSortAsc: vi.fn(),
      onSortDesc: vi.fn(),
      onToggleFreeze: vi.fn(),
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
        {whitespaceColumn.renderCell?.({
          row: {
            [ROW_KEY_FIELD]: "row-1",
            cells: new Map([
              [
                "external_id",
                testValueCell({ case: "stringValue", value: " " }),
              ],
            ]),
          },
        } as never)}
      </span>
    );
    const nonFiniteMarkup = renderToStaticMarkup(
      <span>
        {nonFiniteColumn.renderCell?.({
          row: {
            [ROW_KEY_FIELD]: "row-2",
            cells: new Map([
              [
                "weight",
                testValueCell({ case: "doubleValue", value: Number.NaN }),
              ],
            ]),
          },
        } as never)}
      </span>
    );

    expect(whitespaceMarkup).not.toContain("Open external_id reference");
    expect(nonFiniteMarkup).not.toContain("Open weight reference");
  });

  test("renders a frozen indicator in the column header", () => {
    const column = buildColumn({
      column: testColumn(),
      isFrozen: true,
      onCopyName: vi.fn(),
      onSortAsc: vi.fn(),
      onSortDesc: vi.fn(),
      onToggleFreeze: vi.fn(),
      pkColumnSet: new Set(),
    });

    const rendered = column.renderHeaderCell?.({} as never);

    expect(renderToStaticMarkup(<span>{rendered}</span>)).toContain(
      "Frozen column"
    );
  });

  test("toasts an error when clipboard API is unavailable", () => {
    Object.defineProperty(navigator, "clipboard", {
      configurable: true,
      value: undefined,
    });

    expect(() => writeClipboard("copy me")).not.toThrow();
    expect(toast.success).not.toHaveBeenCalled();
    expect(toast.error).toHaveBeenCalledWith(
      "Clipboard isn't available in this browser"
    );
  });

  test("toasts success after a clipboard write resolves", async () => {
    const writeText = vi.fn().mockResolvedValue(undefined);
    Object.defineProperty(navigator, "clipboard", {
      configurable: true,
      value: { writeText },
    });

    writeClipboard("copy me");
    await vi.waitFor(() => expect(toast.success).toHaveBeenCalledTimes(1));

    expect(writeText).toHaveBeenCalledWith("copy me");
    expect(toast.success).toHaveBeenCalledWith("Copied", { duration: 1500 });
    expect(toast.error).not.toHaveBeenCalled();
  });

  test("toasts an error when a clipboard write rejects", async () => {
    const writeText = vi.fn().mockRejectedValue(new Error("denied"));
    Object.defineProperty(navigator, "clipboard", {
      configurable: true,
      value: { writeText },
    });

    writeClipboard("copy me");
    await vi.waitFor(() => expect(toast.error).toHaveBeenCalledTimes(1));

    expect(toast.error).toHaveBeenCalledWith("Couldn't copy to clipboard");
    expect(toast.success).not.toHaveBeenCalled();
  });
});
