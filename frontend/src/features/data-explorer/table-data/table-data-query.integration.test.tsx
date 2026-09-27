import { create } from "@bufbuild/protobuf";
import { beforeEach, describe, expect, rs, test } from "@rstest/core";
import { act, renderHook } from "@testing-library/react";
import { useTableDataQuery } from "@/features/data-explorer/table-data/table-data-query";
import type { ReadRowsRequest } from "@/protogen/querylane/console/v1alpha1/table_data_pb";
import {
  ColumnSchema,
  DataType,
} from "@/protogen/querylane/console/v1alpha1/table_pb";

const { useListTableColumnsQueryMock, useReadRowsQueryMock } = rs.hoisted(
  () => ({
    useListTableColumnsQueryMock: rs.fn(),
    useReadRowsQueryMock: rs.fn(),
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

  test("resets page tokens after the query shape changes", () => {
    const { result, rerender } = renderHook(
      ({ filterSearch }: { filterSearch?: string }) =>
        useTableDataQuery({
          filterSearch,
          name: tableName,
          onFilterSearchChange: rs.fn(),
          onPageSizeChange: rs.fn(),
          onSortSearchChange: rs.fn(),
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
