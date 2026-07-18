import { create as createProto } from "@bufbuild/protobuf";
import { cleanup, render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import type { SortColumn } from "react-data-grid";
import { afterEach, describe, expect, it, vi } from "vitest";
import { SortPopover } from "@/components/data-grid/table-data-grid/sort-popover";
import {
  type TableResultColumn,
  TableResultColumnSchema,
} from "@/protogen/querylane/console/v1alpha1/table_data_pb";
import { DataType } from "@/protogen/querylane/console/v1alpha1/table_pb";

const SORT_BUTTON_PATTERN = /^Sort/;

function column(name: string): TableResultColumn {
  return createProto(TableResultColumnSchema, {
    columnName: name,
    dataType: DataType.STRING,
    rawType: "text",
  });
}

afterEach(() => {
  cleanup();
});

describe("SortPopover", () => {
  it("adds a column to the sort from the picker", async () => {
    const user = userEvent.setup();
    const onChange = vi.fn<(next: SortColumn[]) => void>();

    render(
      <SortPopover
        columns={[column("aggfnoid"), column("aggkind"), column("aggfinalfn")]}
        onChange={onChange}
        sortColumns={[]}
      />
    );

    await user.click(screen.getByRole("button", { name: "Sort" }));
    await user.click(screen.getByRole("combobox", { name: "Add sort column" }));
    await user.click(screen.getByRole("option", { name: "aggfinalfn" }));

    expect(onChange).toHaveBeenCalledWith([
      { columnKey: "aggfinalfn", direction: "ASC" },
    ]);
  });

  it("sizes the popover from sorted column labels instead of a fixed width", async () => {
    const user = userEvent.setup();

    render(
      <SortPopover
        columns={[
          column("id"),
          column("sub_feature_name"),
          column("is_verified_by"),
        ]}
        onChange={vi.fn()}
        sortColumns={[
          { columnKey: "sub_feature_name", direction: "ASC" },
          { columnKey: "is_verified_by", direction: "DESC" },
        ]}
      />
    );

    await user.click(screen.getByRole("button", { name: SORT_BUTTON_PATTERN }));

    const popover = document.querySelector<HTMLElement>(
      '[data-slot="popover-content"]'
    );

    expect(popover?.className).toContain("w-fit");
    expect(popover?.style.getPropertyValue("--sort-column-select-width")).toBe(
      "21ch"
    );
  });

  it("omits already-sorted columns from the add picker", async () => {
    const user = userEvent.setup();

    render(
      <SortPopover
        columns={[column("id"), column("metadata")]}
        onChange={vi.fn()}
        sortColumns={[{ columnKey: "id", direction: "ASC" }]}
      />
    );

    await user.click(screen.getByRole("button", { name: SORT_BUTTON_PATTERN }));
    await user.click(screen.getByRole("combobox", { name: "Add sort column" }));

    expect(screen.getByRole("option", { name: "metadata" })).toBeTruthy();
    expect(screen.queryByRole("option", { name: "id" })).toBeNull();
  });
});
