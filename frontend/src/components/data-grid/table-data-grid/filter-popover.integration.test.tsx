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
import { FilterPopover } from "@/components/data-grid/table-data-grid/filter-popover";
import { FilterRow } from "@/components/data-grid/table-data-grid/filter-popover-row";
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
  create(TableResultColumnSchema, {
    columnName: "status",
    dataType: DataType.STRING,
    rawType: "text",
  }),
  create(TableResultColumnSchema, {
    columnName: "weight_kg",
    dataType: DataType.INTEGER,
    rawType: "integer",
  }),
];
const WEIGHT_OPTION_NAME = /weight_kg/;

function emailRule(value = ""): TableFilterRule {
  return { column: "email", id: "rule-1", operator: "eq", value };
}

afterEach(() => {
  cleanup();
  vi.useRealTimers();
});

describe("FilterPopover match logic", () => {
  it("labels the first rule with where", async () => {
    const user = userEvent.setup();

    render(
      <FilterPopover
        columns={columns}
        logic="and"
        onChange={vi.fn()}
        rules={[emailRule("alice@example.com")]}
      />
    );

    await user.click(screen.getByRole("button", { name: "Filter 1" }));

    expect(screen.getByRole("dialog", { name: "Filter rows" })).toBeTruthy();
    expect(screen.getByText("where")).toBeTruthy();
    expect(screen.queryByText("Match")).toBeNull();
  });

  it("does not apply the blank starter rule", async () => {
    const user = userEvent.setup();
    const onChange = vi.fn();

    render(
      <FilterPopover
        columns={columns}
        logic="and"
        onChange={onChange}
        rules={[]}
      />
    );

    await user.click(screen.getByRole("button", { name: "Filter" }));
    await user.click(screen.getByRole("button", { name: "Apply" }));

    expect(onChange).toHaveBeenCalledWith([], "and");
  });

  it("applies a freshly typed value on Enter without waiting for the debounce", async () => {
    const user = userEvent.setup();
    const onChange = vi.fn();

    render(
      <FilterPopover
        columns={columns}
        logic="and"
        onChange={onChange}
        rules={[]}
      />
    );

    await user.click(screen.getByRole("button", { name: "Filter" }));
    await user.type(
      screen.getByRole("textbox", { name: "Filter value" }),
      "alice@example.com{Enter}"
    );

    expect(onChange).toHaveBeenCalledWith(
      [
        expect.objectContaining({
          column: "email",
          value: "alice@example.com",
        }),
      ],
      "and"
    );
  });

  it("hides the footer clear action until rules are committed", async () => {
    const user = userEvent.setup();

    render(
      <FilterPopover
        columns={columns}
        logic="and"
        onChange={vi.fn()}
        rules={[]}
      />
    );

    await user.click(screen.getByRole("button", { name: "Filter" }));

    expect(screen.queryByRole("button", { name: "Clear" })).toBeNull();
  });

  it("clears committed rules immediately from the footer", async () => {
    const user = userEvent.setup();
    const onChange = vi.fn();

    render(
      <FilterPopover
        columns={columns}
        logic="or"
        onChange={onChange}
        rules={[emailRule("alice@example.com")]}
      />
    );

    await user.click(screen.getByRole("button", { name: "Filter 1" }));
    await user.click(screen.getByRole("button", { name: "Clear" }));

    expect(onChange).toHaveBeenCalledWith([], "and");
  });
});

describe("FilterPopover value guidance", () => {
  it("lists column types in the column picker", async () => {
    const user = userEvent.setup();

    render(
      <FilterPopover
        columns={columns}
        logic="and"
        onChange={vi.fn()}
        rules={[]}
      />
    );

    await user.click(screen.getByRole("button", { name: "Filter" }));
    await user.click(screen.getByRole("combobox", { name: "Filter column" }));

    const option = screen.getByRole("option", { name: WEIGHT_OPTION_NAME });
    expect(option.textContent).toContain("integer");
  });

  it("offers a true/false picker for boolean columns", async () => {
    const user = userEvent.setup();
    const onChange = vi.fn();

    render(
      <FilterPopover
        columns={columns}
        logic="and"
        onChange={onChange}
        rules={[{ column: "active", id: "rule-1", operator: "eq", value: "" }]}
      />
    );

    await user.click(screen.getByRole("button", { name: "Filter 1" }));

    expect(screen.queryByRole("textbox", { name: "Filter value" })).toBeNull();
    await user.click(screen.getByRole("combobox", { name: "Filter value" }));
    await user.click(screen.getByRole("option", { name: "true" }));
    await user.click(screen.getByRole("button", { name: "Apply" }));

    expect(onChange).toHaveBeenCalledWith(
      [expect.objectContaining({ column: "active", value: "true" })],
      "and"
    );
  });

  it("flags an unparsable value inline and keeps the popover open on apply", async () => {
    const user = userEvent.setup();
    const onChange = vi.fn();

    render(
      <FilterPopover
        columns={columns}
        logic="and"
        onChange={onChange}
        rules={[
          {
            column: "weight_kg",
            id: "rule-1",
            operator: "eq",
            value: "heavy",
          },
        ]}
      />
    );

    await user.click(screen.getByRole("button", { name: "Filter 1" }));

    const input = screen.getByRole("textbox", { name: "Filter value" });
    expect(input.getAttribute("aria-invalid")).toBe("true");
    expect(
      screen.getByText("weight_kg expects a whole number, like 42.")
    ).toBeTruthy();

    await user.click(screen.getByRole("button", { name: "Apply" }));

    expect(onChange).not.toHaveBeenCalled();
    expect(screen.getByRole("dialog", { name: "Filter rows" })).toBeTruthy();
  });
});

describe("FilterRow value editing", () => {
  it("exposes accessible names for filter controls", () => {
    render(
      <div>
        <FilterRow
          columns={columns}
          onApplyRequest={vi.fn()}
          onChange={vi.fn()}
          onRemove={vi.fn()}
          rule={emailRule()}
        />
      </div>
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
      <div>
        <FilterRow
          columns={columns}
          onApplyRequest={vi.fn()}
          onChange={vi.fn()}
          onRemove={vi.fn()}
          rule={emailRule()}
        />
      </div>
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
      <div>
        <FilterRow
          columns={columns}
          onApplyRequest={vi.fn()}
          onChange={onChange}
          onRemove={vi.fn()}
          rule={emailRule()}
        />
      </div>
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
      <div>
        <FilterRow
          columns={columns}
          onApplyRequest={vi.fn()}
          onChange={onChange}
          onRemove={vi.fn()}
          rule={emailRule("alice")}
        />
      </div>
    );

    rerender(
      <div>
        <FilterRow
          columns={columns}
          onApplyRequest={vi.fn()}
          onChange={onChange}
          onRemove={vi.fn()}
          rule={emailRule("")}
        />
      </div>
    );

    const input = screen.getByPlaceholderText<HTMLInputElement>("Value");
    await waitFor(() => expect(input.value).toBe(""));
    expect(onChange).not.toHaveBeenCalled();
  });

  it("cancels a pending value draft when the rule branch changes", () => {
    vi.useFakeTimers();
    const onChange = vi.fn();
    const { rerender } = render(
      <div>
        <FilterRow
          columns={columns}
          onApplyRequest={vi.fn()}
          onChange={onChange}
          onRemove={vi.fn()}
          rule={emailRule()}
        />
      </div>
    );

    fireEvent.change(screen.getByPlaceholderText("Value"), {
      target: { value: "alice@example.com" },
    });

    rerender(
      <div>
        <FilterRow
          columns={columns}
          onApplyRequest={vi.fn()}
          onChange={onChange}
          onRemove={vi.fn()}
          rule={{
            column: "weight_kg",
            id: "rule-1",
            operator: "eq",
            value: "",
          }}
        />
      </div>
    );

    act(() => {
      vi.advanceTimersByTime(250);
    });

    expect(onChange).not.toHaveBeenCalled();
    expect(screen.getByPlaceholderText<HTMLInputElement>("100").value).toBe("");
  });
});
