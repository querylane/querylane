import { create } from "@bufbuild/protobuf";
import { cleanup, render, screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { DataCell } from "@/components/data-grid/table-data-grid/data-cell";
import {
  TableCellSchema,
  TableResultColumnSchema,
  TableValueSchema,
} from "@/protogen/querylane/console/v1alpha1/table_data_pb";
import { DataType } from "@/protogen/querylane/console/v1alpha1/table_pb";

const DIMENSIONS_OBJECT_RE = /"dimensions": \{/;
const BINARY_TABLE_NAME =
  "instances/demo/databases/app/schemas/public/tables/users";
const tableDataApi = vi.hoisted(() => ({
  useReadCellValueMutation: vi.fn(),
}));

vi.mock("@/hooks/api/table-data", () => ({
  useReadCellValueMutation: tableDataApi.useReadCellValueMutation,
}));

beforeEach(() => {
  Object.defineProperty(URL, "createObjectURL", {
    configurable: true,
    value: vi.fn(() => "blob:binary-preview"),
  });
  Object.defineProperty(URL, "revokeObjectURL", {
    configurable: true,
    value: vi.fn(),
  });
});

afterEach(() => {
  cleanup();
  vi.clearAllMocks();
});

describe("DataCell", () => {
  it("renders JSON as a single-line preview with a formatted full-value dialog", async () => {
    const user = userEvent.setup();
    const column = create(TableResultColumnSchema, {
      columnName: "metadata",
      dataType: DataType.JSON,
      rawType: "jsonb",
    });
    const cell = create(TableCellSchema, {
      value: create(TableValueSchema, {
        kind: {
          case: "jsonValue",
          value: '{"brand":"TechCorp","dimensions":{"width":120,"height":80}}',
        },
      }),
    });

    render(<DataCell cell={cell} column={column} />);

    expect(screen.queryByRole("button", { name: "Pretty" })).toBeNull();
    expect(screen.queryByRole("dialog")).toBeNull();
    expect(screen.getByTestId("metadata-json-preview").textContent).toBe(
      '{"brand":"TechCorp","dimensions":{"width":120,"height":80}}'
    );

    await user.click(
      screen.getByRole("button", { name: "View full JSON for metadata" })
    );

    expect(screen.getByRole("dialog", { name: "metadata JSON" })).toBeTruthy();
    expect(screen.getByText(DIMENSIONS_OBJECT_RE)).toBeTruthy();
  });

  it("caps JSON preview titles so large payloads do not become huge DOM attributes", () => {
    const column = create(TableResultColumnSchema, {
      columnName: "metadata",
      dataType: DataType.JSON,
      rawType: "jsonb",
    });
    const raw = `{"payload":"${"x".repeat(2000)}"}`;
    const cell = create(TableCellSchema, {
      value: create(TableValueSchema, {
        kind: {
          case: "jsonValue",
          value: raw,
        },
      }),
    });

    render(<DataCell cell={cell} column={column} />);

    const preview = screen.getByTestId("metadata-json-preview");
    expect(preview.getAttribute("title")?.length).toBeLessThanOrEqual(1001);
    expect(preview.getAttribute("title")?.endsWith("…")).toBe(true);
  });

  it("renders PostgreSQL arrays with a tailored full-value dialog", async () => {
    const user = userEvent.setup();
    const column = create(TableResultColumnSchema, {
      columnName: "tags",
      dataType: DataType.ARRAY,
      rawType: "text[]",
    });
    const cell = create(TableCellSchema, {
      value: create(TableValueSchema, {
        kind: {
          case: "stringValue",
          value: '{alpha,"needs review","comma, value",NULL}',
        },
      }),
    });

    render(<DataCell cell={cell} column={column} />);

    expect(screen.getByTestId("tags-array-preview").textContent).toContain(
      "4 items"
    );
    await user.click(
      screen.getByRole("button", { name: "View full array for tags" })
    );

    const dialog = screen.getByRole("dialog", { name: "tags array" });
    expect(dialog).toBeTruthy();
    expect(within(dialog).getByText("comma, value")).toBeTruthy();
    expect(within(dialog).getByText("SQL NULL")).toBeTruthy();
  });

  it("renders long text with an expand button and a full-value dialog", async () => {
    const user = userEvent.setup();
    const column = create(TableResultColumnSchema, {
      columnName: "description",
      dataType: DataType.STRING,
      rawType: "text",
    });
    const raw = `leading words ${"long text payload ".repeat(20)}trailing words`;
    const cell = create(TableCellSchema, {
      value: create(TableValueSchema, {
        kind: { case: "stringValue", value: raw },
      }),
    });

    render(<DataCell cell={cell} column={column} />);

    expect(screen.queryByRole("dialog")).toBeNull();
    await user.click(
      screen.getByRole("button", { name: "View full text for description" })
    );

    const dialog = screen.getByRole("dialog", { name: "description text" });
    expect(within(dialog).getByText(raw).textContent).toBe(raw);
  });

  it("keeps short text plain without an expand button", () => {
    const column = create(TableResultColumnSchema, {
      columnName: "city",
      dataType: DataType.STRING,
      rawType: "text",
    });
    const cell = create(TableCellSchema, {
      value: create(TableValueSchema, {
        kind: { case: "stringValue", value: "Tokyo" },
      }),
    });

    render(<DataCell cell={cell} column={column} />);

    expect(screen.getByText("Tokyo")).toBeTruthy();
    expect(
      screen.queryByRole("button", { name: "View full text for city" })
    ).toBeNull();
  });

  it("caps text preview titles so large payloads do not become huge DOM attributes", () => {
    const column = create(TableResultColumnSchema, {
      columnName: "description",
      dataType: DataType.STRING,
      rawType: "text",
    });
    const cell = create(TableCellSchema, {
      value: create(TableValueSchema, {
        kind: { case: "stringValue", value: "x".repeat(2000) },
      }),
    });

    render(<DataCell cell={cell} column={column} />);

    const preview = screen.getByTestId("description-text-preview");
    expect(preview.getAttribute("title")?.length).toBeLessThanOrEqual(1001);
    expect(preview.getAttribute("title")?.endsWith("…")).toBe(true);
  });

  it("renders timestamp zones inline for screenshots and narrow grids", () => {
    const column = create(TableResultColumnSchema, {
      columnName: "created_at",
      dataType: DataType.TIMESTAMP,
      rawType: "timestamptz",
    });
    const cell = create(TableCellSchema, {
      value: create(TableValueSchema, {
        kind: {
          case: "timestampValue",
          value: "2026-05-20 10:11:12+00",
        },
      }),
    });

    render(<DataCell cell={cell} column={column} />);

    expect(screen.getByText("2026-05-20 10:11:12 UTC")).toBeTruthy();
  });
});

describe("DataCell binary previews", () => {
  it("fetches binary data only after request and renders an image thumbnail", async () => {
    const user = userEvent.setup();
    const pngBytes = new Uint8Array([
      0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a,
    ]);
    const mutateAsync = vi.fn().mockResolvedValue({
      value: create(TableCellSchema, {
        value: create(TableValueSchema, {
          kind: { case: "bytesValue", value: pngBytes },
        }),
      }),
    });
    tableDataApi.useReadCellValueMutation.mockReturnValue({
      isPending: false,
      mutateAsync,
    });
    const column = create(TableResultColumnSchema, {
      columnName: "avatar",
      dataType: DataType.BINARY,
      rawType: "bytea",
    });
    const cell = create(TableCellSchema, {
      fullSizeBytes: 8n,
      fullValueToken: "avatar-token",
      truncated: true,
      value: create(TableValueSchema, {
        kind: { case: "bytesValue", value: new Uint8Array() },
      }),
    });

    render(
      <DataCell
        cell={cell}
        column={column}
        tableName="instances/demo/databases/app/schemas/public/tables/users"
      />
    );

    expect(mutateAsync).not.toHaveBeenCalled();
    expect(screen.queryByRole("img", { name: "avatar preview" })).toBeNull();

    await user.click(
      screen.getByRole("button", { name: "Preview avatar binary data" })
    );

    expect(mutateAsync).toHaveBeenCalledWith(
      expect.objectContaining({
        fullValueToken: "avatar-token",
        name: "instances/demo/databases/app/schemas/public/tables/users",
      })
    );
    expect(
      (await screen.findByRole("img", { name: "avatar preview" })).getAttribute(
        "src"
      )
    ).toBe("blob:binary-preview");
    expect(
      screen.getByRole("button", { name: "Hide avatar preview" })
    ).toBeTruthy();
  });

  it("does not carry a binary preview error into a different row", async () => {
    const user = userEvent.setup();
    const mutateAsync = vi.fn().mockRejectedValue(new Error("Connection lost"));
    tableDataApi.useReadCellValueMutation.mockReturnValue({
      isPending: false,
      mutateAsync,
    });
    const column = create(TableResultColumnSchema, {
      columnName: "avatar",
      dataType: DataType.BINARY,
      rawType: "bytea",
    });
    function truncatedCell(token: string) {
      return create(TableCellSchema, {
        fullSizeBytes: 42n,
        fullValueToken: token,
        truncated: true,
        value: create(TableValueSchema, {
          kind: { case: "bytesValue", value: new Uint8Array() },
        }),
      });
    }
    const firstCell = truncatedCell("row-1-avatar");
    const secondCell = truncatedCell("row-2-avatar");
    const view = render(
      <DataCell
        cell={firstCell}
        column={column}
        tableName="instances/demo/databases/app/schemas/public/tables/users"
      />
    );

    await user.click(
      screen.getByRole("button", { name: "Preview avatar binary data" })
    );

    expect((await screen.findByRole("alert")).textContent).toContain(
      "Couldn’t preview avatar: Connection lost"
    );
    expect(
      screen.getByRole("button", { name: "Preview avatar binary data" })
        .textContent
    ).toContain("Retry");

    view.rerender(
      <DataCell
        cell={secondCell}
        column={column}
        tableName="instances/demo/databases/app/schemas/public/tables/users"
      />
    );

    expect(screen.queryByRole("alert")).toBeNull();
    expect(
      screen.getByRole("button", { name: "Preview avatar binary data" })
        .textContent
    ).toContain("Preview");
  });

  it("recovers from a binary fetch failure when the user retries", async () => {
    const user = userEvent.setup();
    const pngBytes = new Uint8Array([
      0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a,
    ]);
    const mutateAsync = vi
      .fn()
      .mockRejectedValueOnce(new Error("Temporary failure"))
      .mockResolvedValueOnce({
        value: create(TableCellSchema, {
          value: create(TableValueSchema, {
            kind: { case: "bytesValue", value: pngBytes },
          }),
        }),
      });
    tableDataApi.useReadCellValueMutation.mockReturnValue({
      isPending: false,
      mutateAsync,
    });
    const column = create(TableResultColumnSchema, {
      columnName: "avatar",
      dataType: DataType.BINARY,
      rawType: "bytea",
    });
    const cell = create(TableCellSchema, {
      fullSizeBytes: 8n,
      fullValueToken: "avatar-token",
      truncated: true,
      value: create(TableValueSchema, {
        kind: { case: "bytesValue", value: new Uint8Array() },
      }),
    });
    render(
      <DataCell cell={cell} column={column} tableName={BINARY_TABLE_NAME} />
    );
    const previewButton = screen.getByRole("button", {
      name: "Preview avatar binary data",
    });

    await user.click(previewButton);
    expect((await screen.findByRole("alert")).textContent).toContain(
      "Temporary failure"
    );
    expect(previewButton.textContent).toContain("Retry");

    await user.click(previewButton);

    expect(
      await screen.findByRole("img", { name: "avatar preview" })
    ).toBeTruthy();
    expect(screen.queryByRole("alert")).toBeNull();
    expect(mutateAsync).toHaveBeenCalledTimes(2);
  });

  it("rejects a full-value response that remains truncated", async () => {
    const user = userEvent.setup();
    const mutateAsync = vi.fn().mockResolvedValue({
      value: create(TableCellSchema, {
        truncated: true,
        value: create(TableValueSchema, {
          kind: { case: "bytesValue", value: new Uint8Array([0x01]) },
        }),
      }),
    });
    tableDataApi.useReadCellValueMutation.mockReturnValue({
      isPending: false,
      mutateAsync,
    });
    const column = create(TableResultColumnSchema, {
      columnName: "payload",
      dataType: DataType.BINARY,
      rawType: "bytea",
    });
    const cell = create(TableCellSchema, {
      fullSizeBytes: 1_048_576n,
      fullValueToken: "oversized-payload",
      truncated: true,
      value: create(TableValueSchema, {
        kind: { case: "bytesValue", value: new Uint8Array() },
      }),
    });
    render(
      <DataCell cell={cell} column={column} tableName={BINARY_TABLE_NAME} />
    );

    await user.click(
      screen.getByRole("button", { name: "Preview payload binary data" })
    );

    expect((await screen.findByRole("alert")).textContent).toContain(
      "Value exceeds the maximum fetchable size"
    );
    expect(screen.queryByRole("img")).toBeNull();
  });

  it("does not fetch binary values above the preview limit", () => {
    const mutateAsync = vi.fn();
    tableDataApi.useReadCellValueMutation.mockReturnValue({
      isPending: false,
      mutateAsync,
    });
    const column = create(TableResultColumnSchema, {
      columnName: "payload",
      dataType: DataType.BINARY,
      rawType: "bytea",
    });
    const cell = create(TableCellSchema, {
      fullSizeBytes: 16_777_217n,
      fullValueToken: "large-payload",
      truncated: true,
      value: create(TableValueSchema, {
        kind: { case: "bytesValue", value: new Uint8Array() },
      }),
    });

    render(
      <DataCell cell={cell} column={column} tableName={BINARY_TABLE_NAME} />
    );

    expect(screen.getByText("Too large to preview")).toBeTruthy();
    expect(
      screen.queryByRole("button", { name: "Preview payload binary data" })
    ).toBeNull();
    expect(mutateAsync).not.toHaveBeenCalled();
  });

  it("requests at most 16 MB for a deferred binary preview", async () => {
    const user = userEvent.setup();
    const mutateAsync = vi.fn().mockResolvedValue({
      value: create(TableCellSchema, {
        value: create(TableValueSchema, {
          kind: { case: "bytesValue", value: new Uint8Array([0x01]) },
        }),
      }),
    });
    tableDataApi.useReadCellValueMutation.mockReturnValue({
      isPending: false,
      mutateAsync,
    });
    const column = create(TableResultColumnSchema, {
      columnName: "payload",
      dataType: DataType.BINARY,
      rawType: "bytea",
    });
    const cell = create(TableCellSchema, {
      fullSizeBytes: 16_777_216n,
      fullValueToken: "preview-limit-payload",
      truncated: true,
      value: create(TableValueSchema, {
        kind: { case: "bytesValue", value: new Uint8Array() },
      }),
    });

    render(
      <DataCell cell={cell} column={column} tableName={BINARY_TABLE_NAME} />
    );
    await user.click(
      screen.getByRole("button", { name: "Preview payload binary data" })
    );

    expect(mutateAsync).toHaveBeenCalledWith(
      expect.objectContaining({
        fullValueToken: "preview-limit-payload",
        maxBytes: 16_777_216n,
      })
    );
  });

  it("does not offer a preview for an empty binary value", () => {
    tableDataApi.useReadCellValueMutation.mockReturnValue({
      isPending: false,
      mutateAsync: vi.fn(),
    });
    const column = create(TableResultColumnSchema, {
      columnName: "payload",
      dataType: DataType.BINARY,
      rawType: "bytea",
    });
    const cell = create(TableCellSchema, {
      value: create(TableValueSchema, {
        kind: { case: "bytesValue", value: new Uint8Array() },
      }),
    });

    render(
      <DataCell cell={cell} column={column} tableName={BINARY_TABLE_NAME} />
    );

    expect(screen.getByText("‹0 B›")).toBeTruthy();
    expect(
      screen.queryByRole("button", { name: "Preview payload binary data" })
    ).toBeNull();
  });
});
