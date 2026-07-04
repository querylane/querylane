import { create } from "@bufbuild/protobuf";
import { act, renderHook } from "@testing-library/react";
import { beforeEach, describe, expect, test, vi } from "vitest";
import { useTableDataQuery } from "@/features/data-explorer/table-data/table-data-query";
import {
  CellValueMode,
  type ReadRowsRequest,
  RowCountMode,
  RowOrder_Direction,
} from "@/protogen/querylane/console/v1alpha1/table_data_pb";
import {
  ColumnSchema,
  DataType,
} from "@/protogen/querylane/console/v1alpha1/table_pb";

const { useListTableColumnsQueryMock, useReadRowsQueryMock } = vi.hoisted(
  () => ({
    useListTableColumnsQueryMock: vi.fn(),
    useReadRowsQueryMock: vi.fn(),
  })
);

vi.mock("@/hooks/api/table", () => ({
  useListTableColumnsQuery: useListTableColumnsQueryMock,
}));

vi.mock("@/hooks/api/table-data", () => ({
  useReadRowsQuery: useReadRowsQueryMock,
}));

const tableName = "instances/i/databases/d/schemas/public/tables/events";
const columns = [
  create(ColumnSchema, { columnName: "id", dataType: DataType.INTEGER }),
  create(ColumnSchema, { columnName: "email", dataType: DataType.STRING }),
  create(ColumnSchema, {
    columnName: "created_at",
    dataType: DataType.TIMESTAMP,
  }),
];

function isReadRowsRequestLike(value: unknown): value is ReadRowsRequest {
  return (
    typeof value === "object" &&
    value !== null &&
    "name" in value &&
    "pageSize" in value &&
    "pageToken" in value
  );
}

function latestReadRowsCall(): [
  ReadRowsRequest,
  { enabled: boolean; keepPreviousData: boolean },
] {
  const call = useReadRowsQueryMock.mock.calls.at(-1);
  if (!call || call.length < 2) {
    throw new Error("expected read rows query call");
  }
  const [request, options] = call;
  if (!isReadRowsRequestLike(request)) {
    throw new Error("expected read rows query request");
  }
  if (typeof options?.enabled !== "boolean") {
    throw new Error("expected read rows query options.enabled");
  }
  return [
    request,
    {
      enabled: options.enabled,
      keepPreviousData: options.keepPreviousData === true,
    },
  ];
}

describe("useTableDataQuery", () => {
  beforeEach(() => {
    useListTableColumnsQueryMock.mockReset();
    useReadRowsQueryMock.mockReset();
    useListTableColumnsQueryMock.mockReturnValue({
      data: { columns },
      error: null,
      isError: false,
      refetch: vi.fn(),
    });
    useReadRowsQueryMock.mockReturnValue({
      data: undefined,
      error: null,
      isFetching: false,
      isLoading: false,
      refetch: vi.fn(),
    });
  });

  test("owns the read rows request shape and enablement", () => {
    renderHook(() =>
      useTableDataQuery({
        filterSearch: JSON.stringify({
          l: "and",
          r: [{ c: "email", i: "email", o: "ilike", v: "%@acme.com" }],
        }),
        name: tableName,
        onFilterSearchChange: vi.fn(),
        onPageSizeChange: vi.fn(),
        onSortSearchChange: vi.fn(),
        pageSize: 25,
        sortSearch: "created_at:desc",
      })
    );

    const [request, options] = latestReadRowsCall();
    // keepPreviousData keeps the prior page on screen while the next
    // page/sort/filter request loads instead of blanking to a skeleton.
    expect(options).toEqual({ enabled: true, keepPreviousData: true });
    expect(request).toMatchObject({
      cellValueMode: CellValueMode.PREVIEW,
      name: tableName,
      pageSize: 25,
      pageToken: "",
      rowCountMode: RowCountMode.ESTIMATE,
    });
    expect(request.orderBy).toMatchObject([
      { column: "created_at", direction: RowOrder_Direction.DESC },
    ]);
    expect(request.filter?.node.case).toBe("group");
  });

  test("disables row reads until URL column validation finishes", () => {
    useListTableColumnsQueryMock.mockReturnValue({
      data: undefined,
      error: null,
      isError: false,
      refetch: vi.fn(),
    });

    renderHook(() =>
      useTableDataQuery({
        name: tableName,
        onFilterSearchChange: vi.fn(),
        onPageSizeChange: vi.fn(),
        onSortSearchChange: vi.fn(),
        pageSize: 25,
        sortSearch: "created_at:desc",
      })
    );

    const [, options] = latestReadRowsCall();
    expect(options).toEqual({ enabled: false, keepPreviousData: true });
  });

  test("keeps malformed filter URL search and disables row reads", () => {
    const onFilterSearchChange = vi.fn();
    const onSortSearchChange = vi.fn();

    renderHook(() =>
      useTableDataQuery({
        filterSearch: "not-json",
        name: tableName,
        onFilterSearchChange,
        onPageSizeChange: vi.fn(),
        onSortSearchChange,
        pageSize: 25,
        sortSearch: "email:sideways",
      })
    );

    expect(latestReadRowsCall()[1].enabled).toBe(false);
    expect(onFilterSearchChange).not.toHaveBeenCalled();
    expect(onSortSearchChange).toHaveBeenCalledWith(undefined);
  });

  test("retries column catalog errors before retrying disabled row reads", async () => {
    const columnRefetch = vi.fn(() => Promise.resolve({ data: { columns } }));
    const rowRefetch = vi.fn(() => Promise.resolve({ data: undefined }));
    useListTableColumnsQueryMock.mockReturnValue({
      data: undefined,
      error: new Error("column catalog unavailable"),
      isError: true,
      refetch: columnRefetch,
    });
    useReadRowsQueryMock.mockReturnValue({
      data: undefined,
      error: null,
      isFetching: false,
      isLoading: false,
      refetch: rowRefetch,
    });

    const { result } = renderHook(() =>
      useTableDataQuery({
        name: tableName,
        onFilterSearchChange: vi.fn(),
        onPageSizeChange: vi.fn(),
        onSortSearchChange: vi.fn(),
        pageSize: 25,
        sortSearch: "email:asc",
      })
    );

    expect(latestReadRowsCall()[1].enabled).toBe(false);

    await act(async () => {
      await result.current.refetch();
    });

    expect(columnRefetch).toHaveBeenCalledTimes(1);
    expect(rowRefetch).not.toHaveBeenCalled();
  });

  test("passes keepPreviousData so the grid keeps prior rows while refreshing", () => {
    renderHook(() =>
      useTableDataQuery({
        name: tableName,
        onFilterSearchChange: vi.fn(),
        onPageSizeChange: vi.fn(),
        onSortSearchChange: vi.fn(),
        pageSize: 25,
      })
    );

    const [, options] = latestReadRowsCall();
    expect(options.keepPreviousData).toBe(true);
  });

  test("resets page tokens after the query shape changes", () => {
    const { result, rerender } = renderHook(
      ({ filterSearch }: { filterSearch?: string }) =>
        useTableDataQuery({
          filterSearch,
          name: tableName,
          onFilterSearchChange: vi.fn(),
          onPageSizeChange: vi.fn(),
          onSortSearchChange: vi.fn(),
          pageSize: 25,
          sortSearch: "created_at:desc",
        }),
      { initialProps: {} }
    );

    act(() => {
      result.current.controller.goNext("page-2");
    });
    rerender({});
    expect(latestReadRowsCall()[0].pageToken).toBe("page-2");

    rerender({
      filterSearch: JSON.stringify({
        l: "and",
        r: [{ c: "email", i: "email", o: "eq", v: "alice@example.com" }],
      }),
    });

    expect(latestReadRowsCall()[0].pageToken).toBe("");
    expect(result.current.controller.currentPageIndex).toBe(0);
  });
});
