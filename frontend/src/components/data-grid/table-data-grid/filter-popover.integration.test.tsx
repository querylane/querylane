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
const SQL_WHERE_VALIDATION_ERROR_RE =
  /joined with AND only|missing is not available/;
const UNSUPPORTED_SQL_RULES_RE = /cannot be represented in SQL WHERE/i;

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

    expect(screen.getByText("where")).toBeTruthy();
    expect(screen.queryByText("Match")).toBeNull();
  });

  it("applies a SQL WHERE draft through the same rules callback", async () => {
    const user = userEvent.setup();
    const onChange = vi.fn();

    render(
      <FilterPopover
        columns={columns}
        logic="and"
        onChange={onChange}
        rules={[]}
        title="Filter shipping.carriers"
      />
    );

    await user.click(screen.getByRole("button", { name: "Filter" }));
    await user.click(screen.getByRole("tab", { name: "SQL WHERE" }));
    await user.type(
      screen.getByRole("textbox", { name: "SQL WHERE clause" }),
      "status = 'customs_hold' AND weight_kg > 10000"
    );
    await user.click(screen.getByRole("button", { name: "Apply" }));

    expect(onChange).toHaveBeenCalledWith(
      [
        {
          column: "status",
          id: "sql-1-status",
          operator: "eq",
          value: "customs_hold",
        },
        {
          column: "weight_kg",
          id: "sql-2-weight_kg",
          operator: "gt",
          value: "10000",
        },
      ],
      "and"
    );
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

  it("shows every SQL WHERE validation error before applying", async () => {
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
    await user.click(screen.getByRole("tab", { name: "SQL WHERE" }));
    await user.type(
      screen.getByRole("textbox", { name: "SQL WHERE clause" }),
      "missing = 'x' OR status = 'held'"
    );
    await user.click(screen.getByRole("button", { name: "Apply" }));

    expect(screen.getByText(SQL_WHERE_VALIDATION_ERROR_RE)).toBeTruthy();
    expect(onChange).not.toHaveBeenCalled();
  });

  it("does not silently clear rules that SQL WHERE cannot represent", async () => {
    const user = userEvent.setup();
    const onChange = vi.fn();

    render(
      <FilterPopover
        columns={columns}
        logic="and"
        onChange={onChange}
        rules={[
          {
            column: "metadata",
            id: "rule-json",
            operator: "jsonContains",
            value: '{"tier":"enterprise"}',
          },
        ]}
      />
    );

    await user.click(screen.getByRole("button", { name: "Filter 1" }));
    await user.click(screen.getByRole("tab", { name: "SQL WHERE" }));

    expect(screen.getByText(UNSUPPORTED_SQL_RULES_RE)).toBeTruthy();
    expect(
      screen.getByRole<HTMLButtonElement>("button", { name: "Apply" }).disabled
    ).toBe(true);
    expect(onChange).not.toHaveBeenCalled();
  });
});

describe("FilterRow value editing", () => {
  it("exposes accessible names for filter controls", () => {
    render(
      <div>
        <FilterRow
          columns={columns}
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
          onChange={onChange}
          onRemove={vi.fn()}
          rule={{ column: "active", id: "rule-1", operator: "eq", value: "" }}
        />
      </div>
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
