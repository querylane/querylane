import { create } from "@bufbuild/protobuf";
import {
  act,
  cleanup,
  fireEvent,
  render,
  screen,
  waitFor,
} from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, describe, expect, it, vi } from "vitest";
import {
  FilterPopover,
  FilterRow,
} from "@/components/data-grid/table-data-grid/filter-popover";
import type { TableFilterRule } from "@/features/data-explorer/table-data/filter-state";
import { TableResultColumnSchema } from "@/protogen/querylane/console/v1alpha1/table_data_pb";
import { DataType } from "@/protogen/querylane/console/v1alpha1/table_pb";

const columns = [
  create(TableResultColumnSchema, {
    columnName: "email",
    dataType: DataType.STRING,
    rawType: "text",
  }),
  create(TableResultColumnSchema, {
    columnName: "metadata",
    dataType: DataType.JSON,
    rawType: "jsonb",
  }),
  create(TableResultColumnSchema, {
    columnName: "active",
    dataType: DataType.BOOLEAN,
    rawType: "boolean",
  }),
];

function emailRule(value = ""): TableFilterRule {
  return { column: "email", id: "rule-1", operator: "eq", value };
}

afterEach(() => {
  cleanup();
  vi.useRealTimers();
});

describe("FilterPopover match logic", () => {
  it("shows the all label for the default match logic", async () => {
    const user = userEvent.setup();

    render(
      <FilterPopover
        columns={columns}
        logic="and"
        onChange={vi.fn()}
        onLogicChange={vi.fn()}
        rules={[emailRule("alice@example.com")]}
      />
    );

    await user.click(screen.getByRole("button", { name: "Filter 1" }));

    const matchControl = screen.getByText("Match").parentElement;
    if (!matchControl) {
      throw new Error("expected match control");
    }

    expect(matchControl.textContent).toContain("all");
    expect(matchControl.textContent).not.toContain("and");
  });
});

describe("FilterRow value editing", () => {
  it("exposes accessible names for filter controls", () => {
    render(
      <ul>
        <FilterRow
          columns={columns}
          onChange={vi.fn()}
          onRemove={vi.fn()}
          rule={emailRule()}
        />
      </ul>
    );

    expect(
      screen.getByRole("combobox", { name: "Filter column" })
    ).toBeTruthy();
    expect(
      screen.getByRole("combobox", { name: "Filter operator" })
    ).toBeTruthy();
    expect(screen.getByRole("textbox", { name: "Filter value" })).toBeTruthy();
  });

  it("lists operator labels in the operator picker", async () => {
    const user = userEvent.setup();

    render(
      <ul>
        <FilterRow
          columns={columns}
          onChange={vi.fn()}
          onRemove={vi.fn()}
          rule={emailRule()}
        />
      </ul>
    );

    await user.click(screen.getByRole("combobox", { name: "Filter operator" }));

    expect(screen.getByRole("option", { name: "LIKE" })).toBeTruthy();
    expect(screen.getByRole("option", { name: "ILIKE" })).toBeTruthy();
    expect(screen.getByRole("option", { name: "!=" })).toBeTruthy();
    expect(screen.queryByText("eq")).toBeNull();
  });

  it("debounces keystrokes into a single rule change", async () => {
    const user = userEvent.setup();
    const onChange = vi.fn();

    render(
      <ul>
        <FilterRow
          columns={columns}
          onChange={onChange}
          onRemove={vi.fn()}
          rule={emailRule()}
        />
      </ul>
    );

    const input = screen.getByPlaceholderText<HTMLInputElement>("Value");
    await user.type(input, "abc");

    // The input tracks every keystroke locally without firing a query +
    // history push per character.
    expect(input.value).toBe("abc");
    expect(onChange).not.toHaveBeenCalled();

    await waitFor(() => expect(onChange).toHaveBeenCalledTimes(1));
    expect(onChange).toHaveBeenCalledWith({ value: "abc" });
  });

  it("resets the draft when the rule value changes from outside", async () => {
    const onChange = vi.fn();
    const { rerender } = render(
      <ul>
        <FilterRow
          columns={columns}
          onChange={onChange}
          onRemove={vi.fn()}
          rule={emailRule("alice")}
        />
      </ul>
    );

    rerender(
      <ul>
        <FilterRow
          columns={columns}
          onChange={onChange}
          onRemove={vi.fn()}
          rule={emailRule("")}
        />
      </ul>
    );

    const input = screen.getByPlaceholderText<HTMLInputElement>("Value");
    await waitFor(() => expect(input.value).toBe(""));
    expect(onChange).not.toHaveBeenCalled();
  });

  it("cancels a pending value draft when the rule branch changes", () => {
    vi.useFakeTimers();
    const onChange = vi.fn();
    const { rerender } = render(
      <ul>
        <FilterRow
          columns={columns}
          onChange={onChange}
          onRemove={vi.fn()}
          rule={emailRule()}
        />
      </ul>
    );

    fireEvent.change(screen.getByPlaceholderText("Value"), {
      target: { value: "alice@example.com" },
    });

    rerender(
      <ul>
        <FilterRow
          columns={columns}
          onChange={onChange}
          onRemove={vi.fn()}
          rule={{ column: "active", id: "rule-1", operator: "eq", value: "" }}
        />
      </ul>
    );

    act(() => {
      vi.advanceTimersByTime(250);
    });

    expect(onChange).not.toHaveBeenCalled();
    expect(screen.getByPlaceholderText<HTMLInputElement>("true").value).toBe(
      ""
    );
  });
});
