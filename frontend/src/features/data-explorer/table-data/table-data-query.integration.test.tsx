import { create } from "@bufbuild/protobuf";
import { beforeEach, describe, expect, rs, test } from "@rstest/core";
import { act, renderHook } from "@testing-library/react";
import { useTableDataQuery } from "@/features/data-explorer/table-data/table-data-query";
import type { useReadRowsQuery } from "@/hooks/api/table-data";
import type { ReadRowsRequest } from "@/protogen/querylane/console/v1alpha1/table_data_pb";
import {
  ColumnSchema,
  DataType,
} from "@/protogen/querylane/console/v1alpha1/table_pb";

const { useListTableColumnsQueryMock, useReadRowsQueryMock } = rs.hoisted(
  () => ({
    useListTableColumnsQueryMock: rs.fn(),
    useReadRowsQueryMock:
      rs.fn<(...args: Parameters<typeof useReadRowsQuery>) => unknown>(),
  })
);

rs.mock("@/hooks/api/table", () => ({
  useListTableColumnsQuery: useListTableColumnsQueryMock,
}));

rs.mock("@/hooks/api/table-data", () => ({
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
    throw new TypeError("expected read rows query options.enabled");
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
      refetch: rs.fn(),
    });
    useReadRowsQueryMock.mockReturnValue({
      data: undefined,
      error: null,
      isFetching: false,
      isLoading: false,
      refetch: rs.fn(),
    });
  });

  test("retries column catalog errors before retrying disabled row reads", async () => {
    const columnRefetch = rs.fn(() => Promise.resolve({ data: { columns } }));
    const rowRefetch = rs.fn(() => Promise.resolve({ data: undefined }));
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
        onFilterSearchChange: rs.fn(),
        onPageSizeChange: rs.fn(),
        onSortSearchChange: rs.fn(),
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

  test("revisits the next page with an unchanged continuation token", () => {
    const { result } = renderHook(() =>
      useTableDataQuery({
        name: tableName,
        onFilterSearchChange: rs.fn(),
        onPageSizeChange: rs.fn(),
        onSortSearchChange: rs.fn(),
        pageSize: 25,
        sortSearch: "created_at:desc",
      })
    );
    const indices = [result.current.controller.currentPageIndex];
    const requestTokens = [latestReadRowsCall()[0].pageToken];

    act(() => {
      result.current.controller.goNext("T2");
    });
    indices.push(result.current.controller.currentPageIndex);
    requestTokens.push(latestReadRowsCall()[0].pageToken);

    act(() => {
      result.current.controller.goPrev();
    });
    indices.push(result.current.controller.currentPageIndex);
    requestTokens.push(latestReadRowsCall()[0].pageToken);

    act(() => {
      result.current.controller.goNext("T2");
    });
    indices.push(result.current.controller.currentPageIndex);
    requestTokens.push(latestReadRowsCall()[0].pageToken);

    expect({ indices, requestTokens }).toEqual({
      indices: [0, 1, 0, 1],
      requestTokens: ["", "T2", "", "T2"],
    });
  });

  test("revisits later pages and ignores duplicate next callbacks", () => {
    const { result } = renderHook(() =>
      useTableDataQuery({
        name: tableName,
        onFilterSearchChange: rs.fn(),
        onPageSizeChange: rs.fn(),
        onSortSearchChange: rs.fn(),
        pageSize: 25,
        sortSearch: "created_at:desc",
      })
    );

    act(() => {
      result.current.controller.goNext("");
      result.current.controller.goPrev();
    });
    expect(result.current.controller.currentPageIndex).toBe(0);
    expect(latestReadRowsCall()[0].pageToken).toBe("");

    for (const token of ["T2", "T3"]) {
      act(() => {
        const { goNext } = result.current.controller;
        goNext(token);
        goNext(token);
      });
    }
    expect(result.current.controller.currentPageIndex).toBe(2);
    expect(latestReadRowsCall()[0].pageToken).toBe("T3");

    act(() => {
      result.current.controller.goPrev();
    });
    act(() => {
      result.current.controller.goPrev();
    });
    act(() => {
      result.current.controller.goNext("T2");
    });
    act(() => {
      result.current.controller.goNext("T3");
    });
    expect(result.current.controller.currentPageIndex).toBe(2);
    expect(latestReadRowsCall()[0].pageToken).toBe("T3");
  });

  test.each([
    {
      shape: "filter",
      changes: {
        filterSearch: JSON.stringify({
          l: "and",
          r: [{ c: "email", i: "email", o: "eq", v: "alice@example.com" }],
        }),
      },
    },
    { shape: "sort", changes: { sortSearch: "email:asc" } },
    { shape: "page size", changes: { pageSize: 50 } },
    { shape: "projection", changes: { selectedColumns: ["id"] } },
    { shape: "table", changes: { name: `${tableName}-other` } },
  ])("resets page tokens after the $shape changes", ({ changes }) => {
    const { result, rerender } = renderHook(
      (props: Partial<Parameters<typeof useTableDataQuery>[0]>) =>
        useTableDataQuery({
          name: tableName,
          onFilterSearchChange: rs.fn(),
          onPageSizeChange: rs.fn(),
          onSortSearchChange: rs.fn(),
          pageSize: 25,
          sortSearch: "created_at:desc",
          ...props,
        }),
      { initialProps: {} }
    );

    act(() => {
      result.current.controller.goNext("T2");
    });
    expect(latestReadRowsCall()[0].pageToken).toBe("T2");

    rerender(changes);
    expect(latestReadRowsCall()[0].pageToken).toBe("");
    expect(result.current.controller.currentPageIndex).toBe(0);

    act(() => {
      result.current.controller.goNext("new-shape-T2");
    });
    expect(latestReadRowsCall()[0].pageToken).toBe("new-shape-T2");
    expect(result.current.controller.currentPageIndex).toBe(1);
  });
});
