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
  TableValueSchema,
} from "@/protogen/querylane/console/v1alpha1/table_data_pb";
import { DataType } from "@/protogen/querylane/console/v1alpha1/table_pb";

vi.mock("sonner", () => ({
  toast: {
    error: vi.fn(),
    success: vi.fn(),
  },
}));

function testColumn() {
  return createProto(TableResultColumnSchema, {
    columnName: "email",
    dataType: DataType.STRING,
    rawType: "text",
  });
}

function testCell(value: string) {
  return createProto(TableCellSchema, {
    value: createProto(TableValueSchema, {
      kind: { case: "stringValue", value },
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
    expect(column.width).toBeGreaterThanOrEqual(140);

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
