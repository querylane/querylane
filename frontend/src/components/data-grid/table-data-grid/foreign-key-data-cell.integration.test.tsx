import { create } from "@bufbuild/protobuf";
import { act, cleanup, render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, beforeEach, describe, expect, test, vi } from "vitest";
import { ForeignKeyDataCell } from "@/components/data-grid/table-data-grid/foreign-key-data-cell";
import type { ForeignKeyReferencePreview } from "@/components/data-grid/table-data-grid/foreign-key-reference-state";
import { INTENT_PREFETCH_POLICY } from "@/lib/query-policy";
import {
  RowFilterSchema,
  TableCellSchema,
  TableResultColumnSchema,
  TableValueSchema,
} from "@/protogen/querylane/console/v1alpha1/table_data_pb";
import { DataType } from "@/protogen/querylane/console/v1alpha1/table_pb";

const TEST_NUMBER_50 = 50;
const TEST_NUMBER_75 = 75;
const TEST_NUMBER_25 = 25;

const tableDataApi = vi.hoisted(() => {
  const queryActions = {
    fetch: vi.fn(() => Promise.resolve()),
    getState: vi.fn(() => ({ fetchStatus: "idle", status: "success" })),
    prefetch: vi.fn(),
  };
  return {
    queryActions,
    useReadCellValueMutation: vi.fn(() => ({
      isError: false,
      isPending: false,
      mutate: vi.fn(),
    })),
    useReadRowsQuery: vi.fn(),
    useReadRowsQueryActions: vi.fn(() => queryActions),
  };
});

vi.mock("@/hooks/api/table-data", () => ({
  useReadCellValueMutation: tableDataApi.useReadCellValueMutation,
  useReadRowsQuery: tableDataApi.useReadRowsQuery,
  useReadRowsQueryActions: tableDataApi.useReadRowsQueryActions,
}));

const column = create(TableResultColumnSchema, {
  columnName: "carrier_id",
  dataType: DataType.INTEGER,
  rawType: "int4",
});
const cell = create(TableCellSchema, {
  value: create(TableValueSchema, {
    kind: { case: "int64Value", value: 214n },
  }),
});
const preview: ForeignKeyReferencePreview = {
  displayValue: "214",
  isComposite: false,
  reference: {
    sourceColumns: ["carrier_id"],
    targetColumns: ["id"],
    targetTableName:
      "instances/prod/databases/app/schemas/public/tables/carriers",
  },
  requiredFilter: create(RowFilterSchema),
  sourceColumn: "carrier_id",
  targetLabel: "public.carriers",
};

function renderForeignKeyCell() {
  render(
    <>
      <ForeignKeyDataCell cell={cell} column={column} preview={preview} />
      <p>{"Other surface"}</p>
    </>
  );
  return screen.getByRole("button", {
    name: "Open carrier_id reference 214",
  });
}

function setupUser() {
  return userEvent.setup();
}

beforeEach(() => {
  tableDataApi.queryActions.fetch.mockReset();
  tableDataApi.queryActions.fetch.mockResolvedValue(undefined);
  tableDataApi.queryActions.getState.mockReset();
  tableDataApi.queryActions.getState.mockReturnValue({
    fetchStatus: "idle",
    status: "success",
  });
  tableDataApi.queryActions.prefetch.mockReset();
  tableDataApi.useReadRowsQuery.mockReset();
  tableDataApi.useReadRowsQuery.mockReturnValue({
    data: undefined,
    error: null,
    fetchStatus: "idle",
    isError: false,
    isPending: false,
    refetch: vi.fn(),
  });
});

afterEach(() => {
  cleanup();
  vi.clearAllMocks();
});

describe("ForeignKeyDataCell intent prefetch", () => {
  test("prefetches after hover dwell and cancels when the pointer leaves", async () => {
    const user = setupUser();
    const trigger = renderForeignKeyCell();

    await user.hover(trigger);
    await new Promise((resolve) =>
      globalThis.setTimeout(
        resolve,
        INTENT_PREFETCH_POLICY.delayMs - TEST_NUMBER_50
      )
    );
    expect(tableDataApi.queryActions.prefetch).not.toHaveBeenCalled();

    await user.unhover(trigger);
    await new Promise((resolve) =>
      globalThis.setTimeout(resolve, TEST_NUMBER_75)
    );
    expect(tableDataApi.queryActions.prefetch).not.toHaveBeenCalled();

    await user.hover(trigger);
    await new Promise((resolve) =>
      globalThis.setTimeout(
        resolve,
        INTENT_PREFETCH_POLICY.delayMs + TEST_NUMBER_25
      )
    );
    expect(tableDataApi.queryActions.prefetch).toHaveBeenCalledTimes(1);
  });

  test("prefetches immediately on keyboard focus", async () => {
    const user = setupUser();
    renderForeignKeyCell();

    await user.tab();

    expect(tableDataApi.queryActions.prefetch).toHaveBeenCalledTimes(1);
  });
});

test("clicking outside cancels a delayed popover open", async () => {
  let resolveFetch: (() => void) | undefined;
  const fetchPromise = new Promise<void>((resolve) => {
    resolveFetch = resolve;
  });
  tableDataApi.queryActions.getState.mockReturnValue({
    fetchStatus: "fetching",
    status: "pending",
  });
  tableDataApi.queryActions.fetch.mockReturnValue(fetchPromise);
  const user = setupUser();
  const trigger = renderForeignKeyCell();

  await user.click(trigger);
  expect(trigger.getAttribute("aria-busy")).toBe("true");

  await user.click(screen.getByText("Other surface"));
  expect(trigger.hasAttribute("aria-busy")).toBe(false);
  resolveFetch?.();
  await act(() => fetchPromise);

  expect(screen.queryByRole("dialog", { name: "public.carriers" })).toBeNull();
});

test("opens the waiting state when the clicked fetch pauses", async () => {
  tableDataApi.queryActions.getState.mockReturnValue({
    fetchStatus: "paused",
    status: "pending",
  });
  tableDataApi.queryActions.fetch.mockReturnValue(new Promise(() => undefined));
  tableDataApi.useReadRowsQuery.mockReturnValue({
    data: undefined,
    error: null,
    fetchStatus: "paused",
    isError: false,
    isPending: true,
    refetch: vi.fn(),
  });
  const user = setupUser();
  const trigger = renderForeignKeyCell();

  await user.click(trigger);

  expect(
    screen.getByRole("status", { name: "Waiting for connection" })
  ).toBeTruthy();
});

test("opens the error state when the clicked fetch fails", async () => {
  const error = new Error("target read failed");
  tableDataApi.queryActions.getState.mockReturnValue({
    fetchStatus: "fetching",
    status: "pending",
  });
  tableDataApi.queryActions.fetch.mockRejectedValue(error);
  tableDataApi.useReadRowsQuery.mockReturnValue({
    data: undefined,
    error,
    fetchStatus: "idle",
    isError: true,
    isPending: false,
    refetch: vi.fn(),
  });
  const user = setupUser();
  const trigger = renderForeignKeyCell();

  await user.click(trigger);

  expect(screen.getByRole("alert")).toBeTruthy();
  expect(screen.getByText("Couldn’t load referenced row")).toBeTruthy();
});
