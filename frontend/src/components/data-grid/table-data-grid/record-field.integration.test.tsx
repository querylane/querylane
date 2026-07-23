import { create } from "@bufbuild/protobuf";
import { cleanup, render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, describe, expect, it, vi } from "vitest";
import { RecordField } from "@/components/data-grid/table-data-grid/record-field";
import {
  TableCellSchema,
  TableResultColumnSchema,
  TableValueSchema,
} from "@/protogen/querylane/console/v1alpha1/table_data_pb";
import { DataType } from "@/protogen/querylane/console/v1alpha1/table_pb";

const tableDataApi = vi.hoisted(() => ({
  useReadCellValueMutation: vi.fn(),
}));
const writeClipboardMock = vi.hoisted(() => vi.fn());
const writeClipboardDeferredMock = vi.hoisted(() => vi.fn());
const downloadBlobMock = vi.hoisted(() => vi.fn());

vi.mock("@/components/data-grid/table-data-grid/grid-clipboard", () => ({
  writeClipboard: writeClipboardMock,
  writeClipboardDeferred: writeClipboardDeferredMock,
}));

vi.mock("@/lib/download-blob", () => ({
  downloadBlob: downloadBlobMock,
}));

vi.mock("@/hooks/api/table-data", () => ({
  useReadCellValueMutation: tableDataApi.useReadCellValueMutation,
}));

describe("RecordField", () => {
  afterEach(() => {
    cleanup();
    vi.clearAllMocks();
  });

  it("renders PostgreSQL arrays as indexed values in the detail drawer", () => {
    tableDataApi.useReadCellValueMutation.mockReturnValue({
      isError: false,
      isPending: false,
      mutate: vi.fn(),
    });
    const column = create(TableResultColumnSchema, {
      columnName: "tags",
      dataType: DataType.ARRAY,
      rawType: "text[]",
    });
    const cell = create(TableCellSchema, {
      value: create(TableValueSchema, {
        kind: {
          case: "stringValue",
          value: '{alpha,"needs review",NULL}',
        },
      }),
    });

    render(
      <RecordField
        cell={cell}
        column={column}
        isPrimaryKey={false}
        tableName="instances/demo/databases/app/schemas/public/tables/widgets"
      />
    );

    expect(screen.getByText("3 items")).toBeTruthy();
    expect(screen.getByText("needs review")).toBeTruthy();
    expect(screen.getByText("SQL NULL")).toBeTruthy();
  });

  it("keeps timestamp timezone context visible and copies the raw value", async () => {
    const user = userEvent.setup();
    tableDataApi.useReadCellValueMutation.mockReturnValue({
      isError: false,
      isPending: false,
      mutate: vi.fn(),
    });
    const column = create(TableResultColumnSchema, {
      columnName: "observed_at",
      dataType: DataType.TIMESTAMP,
      rawType: "timestamptz",
    });
    const cell = create(TableCellSchema, {
      value: create(TableValueSchema, {
        kind: {
          case: "timestampValue",
          value: "2026-05-20T10:11:12+05:30",
        },
      }),
    });

    render(
      <RecordField
        cell={cell}
        column={column}
        isPrimaryKey={false}
        tableName="instances/demo/databases/app/schemas/public/tables/widgets"
      />
    );

    expect(screen.getByText("2026-05-20 10:11:12 UTC+05:30")).toBeTruthy();
    await user.click(screen.getByRole("button", { name: "Copy observed_at" }));

    expect(writeClipboardMock).toHaveBeenCalledWith(
      "2026-05-20T10:11:12+05:30"
    );
  });

  it("downloads a truncated bytea value after fetching it in full", async () => {
    const user = userEvent.setup();
    const fullBytes = new Uint8Array([1, 2, 3, 4]);
    const mutateAsync = vi.fn().mockResolvedValue({
      value: create(TableCellSchema, {
        value: create(TableValueSchema, {
          kind: { case: "bytesValue", value: fullBytes },
        }),
      }),
    });
    tableDataApi.useReadCellValueMutation.mockReturnValue({
      isError: false,
      isPending: false,
      mutate: vi.fn(),
      mutateAsync,
    });
    const column = create(TableResultColumnSchema, {
      columnName: "avatar",
      dataType: DataType.BINARY,
      rawType: "bytea",
    });
    const cell = create(TableCellSchema, {
      fullSizeBytes: 4n,
      fullValueToken: "token-1",
      truncated: true,
      value: create(TableValueSchema, {
        kind: { case: "bytesValue", value: new Uint8Array() },
      }),
    });

    render(
      <RecordField
        cell={cell}
        column={column}
        isPrimaryKey={false}
        rowIdentifier="42"
        tableName="instances/demo/databases/app/schemas/public/tables/widgets"
      />
    );

    expect(screen.getByText("‹4 B›")).toBeTruthy();
    await user.click(screen.getByRole("button", { name: "Download avatar" }));

    expect(mutateAsync).toHaveBeenCalledWith(
      expect.objectContaining({ fullValueToken: "token-1" })
    );
    expect(downloadBlobMock).toHaveBeenCalledWith(
      "widgets_avatar_42.bin",
      fullBytes,
      "application/octet-stream"
    );
  });

  it("fetches the full value before copying a truncated cell", async () => {
    const user = userEvent.setup();
    const mutateAsync = vi.fn().mockResolvedValue({
      value: create(TableCellSchema, {
        value: create(TableValueSchema, {
          kind: { case: "stringValue", value: "the complete text" },
        }),
      }),
    });
    tableDataApi.useReadCellValueMutation.mockReturnValue({
      isError: false,
      isPending: false,
      mutate: vi.fn(),
      mutateAsync,
    });
    const column = create(TableResultColumnSchema, {
      columnName: "notes",
      dataType: DataType.STRING,
      rawType: "text",
    });
    const cell = create(TableCellSchema, {
      fullSizeBytes: 17n,
      fullValueToken: "token-2",
      truncated: true,
      value: create(TableValueSchema, {
        kind: { case: "stringValue", value: "the com" },
      }),
    });

    render(
      <RecordField
        cell={cell}
        column={column}
        isPrimaryKey={false}
        tableName="instances/demo/databases/app/schemas/public/tables/widgets"
      />
    );

    await user.click(screen.getByRole("button", { name: "Copy notes" }));

    expect(writeClipboardMock).not.toHaveBeenCalled();
    expect(writeClipboardDeferredMock).toHaveBeenCalledTimes(1);
    const getText = writeClipboardDeferredMock.mock.calls[0]?.[0];
    await expect(getText()).resolves.toBe("the complete text");
    expect(mutateAsync).toHaveBeenCalledWith(
      expect.objectContaining({ fullValueToken: "token-2" })
    );
  });
});
