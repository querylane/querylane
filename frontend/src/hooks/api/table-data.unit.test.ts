import { create } from "@bufbuild/protobuf";
import { beforeEach, describe, expect, test, vi } from "vitest";
import {
  useReadCellValueMutation,
  useReadRowsQuery,
} from "@/hooks/api/table-data";
import { QUERY_STALE_TIME, RESOURCE_QUERY_OPTIONS } from "@/lib/query-policy";
import { ReadRowsRequestSchema } from "@/protogen/querylane/console/v1alpha1/table_data_pb";
import {
  readCellValue,
  readRows,
} from "@/protogen/querylane/console/v1alpha1/table_data-TableDataService_connectquery";

const { useMutationMock, useQueryMock } = vi.hoisted(() => ({
  useMutationMock: vi.fn(),
  useQueryMock: vi.fn(),
}));

vi.mock("@connectrpc/connect-query", () => ({
  useMutation: useMutationMock,
  useQuery: useQueryMock,
}));

describe("useReadRowsQuery", () => {
  beforeEach(() => {
    useQueryMock.mockReset();
    useMutationMock.mockReset();
  });

  test("disables reads until the table resource name is known", () => {
    const request = create(ReadRowsRequestSchema, { name: "" });

    useReadRowsQuery(request);

    expect(useQueryMock).toHaveBeenCalledWith(
      readRows,
      expect.objectContaining({ name: "" }),
      expect.objectContaining({ enabled: false })
    );
  });

  test("honors caller disabled state even when a table name is present", () => {
    const request = create(ReadRowsRequestSchema, {
      name: "instances/i/databases/d/schemas/public/tables/events",
    });

    useReadRowsQuery(request, { enabled: false });

    expect(useQueryMock).toHaveBeenCalledWith(
      readRows,
      request,
      expect.objectContaining({ enabled: false })
    );
  });

  test("does not keep stale rows as placeholder data by default", () => {
    const request = create(ReadRowsRequestSchema, {
      name: "instances/i/databases/d/schemas/public/tables/events",
    });

    useReadRowsQuery(request);

    const options = useQueryMock.mock.calls[0]?.[2];
    expect(options).toEqual({
      enabled: true,
      staleTime: QUERY_STALE_TIME.tableRows,
    });
  });

  test("applies the tableRows stale-time policy so rows are always fresh on revisit", () => {
    const request = create(ReadRowsRequestSchema, {
      name: "instances/i/databases/d/schemas/public/tables/events",
    });

    useReadRowsQuery(request);

    const options = useQueryMock.mock.calls[0]?.[2];
    expect(options).toMatchObject(RESOURCE_QUERY_OPTIONS.tableRows);
    expect(options.staleTime).toBe(0);
  });

  test("keeps previous rows when explicitly requested for the same table", () => {
    const tableName = "instances/i/databases/d/schemas/public/tables/events";
    const request = create(ReadRowsRequestSchema, { name: tableName });

    useReadRowsQuery(request, { keepPreviousData: true });

    const options = useQueryMock.mock.calls[0]?.[2];
    expect(options).toMatchObject({ enabled: true });
    expect(
      options.placeholderData("previous-page", {
        queryKey: [{ name: tableName }],
      })
    ).toBe("previous-page");
    expect(
      options.placeholderData("previous-page", {
        queryKey: [
          { name: "instances/i/databases/d/schemas/public/tables/other" },
        ],
      })
    ).toBeUndefined();
  });
});

describe("useReadCellValueMutation", () => {
  beforeEach(() => {
    useMutationMock.mockReset();
  });

  test("uses the generated ReadCellValue mutation descriptor", () => {
    const options = { onSuccess: vi.fn() };

    useReadCellValueMutation(options);

    expect(useMutationMock).toHaveBeenCalledWith(readCellValue, options);
  });
});
