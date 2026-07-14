import { create } from "@bufbuild/protobuf";
import { cleanup, render, screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, describe, expect, it } from "vitest";
import { DataCell } from "@/components/data-grid/table-data-grid/data-cell";
import {
  TableCellSchema,
  TableResultColumnSchema,
  TableValueSchema,
} from "@/protogen/querylane/console/v1alpha1/table_data_pb";
import { DataType } from "@/protogen/querylane/console/v1alpha1/table_pb";

const DIMENSIONS_OBJECT_RE = /"dimensions": \{/;

afterEach(() => cleanup());

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
