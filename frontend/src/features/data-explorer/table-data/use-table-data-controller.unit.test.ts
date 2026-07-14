import { create } from "@bufbuild/protobuf";
import type { SortColumn } from "react-data-grid";
import { beforeEach, describe, expect, test, vi } from "vitest";
import {
  MAX_SORT_COLUMNS,
  pushPageToken,
  useTableDataController,
} from "@/features/data-explorer/table-data/use-table-data-controller";
import {
  CellValueMode,
  RowCountMode,
  RowFilterSchema,
  RowOrder_Direction,
  RowPredicate_Operator,
  RowPredicateSchema,
  TableValueSchema,
} from "@/protogen/querylane/console/v1alpha1/table_data_pb";

const TEST_NUMBER_50 = 50;
const TEST_NUMBER_100 = 100;

const { setStateMocks, useStateMock } = vi.hoisted(() => ({
  setStateMocks: [] as ReturnType<typeof vi.fn>[],
  useStateMock: vi.fn(),
}));

interface PageTokenState {
  currentPageIndex: number;
  queryShapeKey: string;
  tokens: string[];
}

vi.mock("react", () => ({
  useState: useStateMock,
}));

function arrangeUseState() {
  setStateMocks.length = 0;
  useStateMock.mockImplementation((initial: unknown) => {
    const value = typeof initial === "function" ? initial() : initial;
    const setter = vi.fn();
    setStateMocks.push(setter);
    return [value, setter];
  });
}

function expectPageTokenUpdater(
  value: unknown
): asserts value is (prev: PageTokenState) => PageTokenState {
  if (typeof value !== "function") {
    throw new Error("expected page token updater");
  }
}

function buildTestFilter(column: string, value: string) {
  return create(RowFilterSchema, {
    node: {
      case: "predicate",
      value: create(RowPredicateSchema, {
        column,
        operator: RowPredicate_Operator.EQUAL,
        values: [
          create(TableValueSchema, {
            kind: { case: "stringValue", value },
          }),
        ],
      }),
    },
  });
}

describe("pushPageToken", () => {
  test("uses the captured source index when pushing a next-page token", () => {
    expect(pushPageToken(["", "page-2", "stale"], 1, "page-3")).toEqual([
      "",
      "page-2",
      "page-3",
    ]);
  });

  test("preserves the same stack when the token is already present next", () => {
    const prev = ["", "page-2"];
    expect(pushPageToken(prev, 0, "page-2")).toBe(prev);
  });
});

describe("useTableDataController", () => {
  beforeEach(() => {
    useStateMock.mockReset();
    arrangeUseState();
  });

  test("builds read rows requests from sort and pagination state", () => {
    const sortColumns: SortColumn[] = [
      { columnKey: "created_at", direction: "DESC" },
      { columnKey: "id", direction: "ASC" },
    ];

    const controller = useTableDataController({
      name: "instances/i/databases/d/schemas/public/tables/events",
      onPageSizeChange: vi.fn(),
      onSortColumnsChange: vi.fn(),
      pageSize: 50,
      sortColumns,
    });

    expect(controller.currentPageIndex).toBe(0);
    expect(controller.pageSize).toBe(TEST_NUMBER_50);
    expect(controller.request).toMatchObject({
      cellValueMode: CellValueMode.PREVIEW,
      name: "instances/i/databases/d/schemas/public/tables/events",
      pageSize: 50,
      pageToken: "",
      rowCountMode: RowCountMode.ESTIMATE,
    });
    expect(controller.request.orderBy).toMatchObject([
      { column: "created_at", direction: RowOrder_Direction.DESC },
      { column: "id", direction: RowOrder_Direction.ASC },
    ]);
  });

  test("includes filters in requests and resets stale page tokens for filter shape changes", () => {
    const filter = buildTestFilter("email", "alice@example.com");
    const nextFilter = buildTestFilter("email", "bob@example.com");

    const controller = useTableDataController({
      filter,
      name: "table-a",
      onPageSizeChange: vi.fn(),
      onSortColumnsChange: vi.fn(),
      pageSize: 25,
      sortColumns: [],
    });

    expect(controller.currentPageIndex).toBe(0);
    expect(controller.request.pageToken).toBe("");
    expect(controller.request.filter).toBe(filter);

    controller.setPageSize(TEST_NUMBER_50);
    expect(setStateMocks[0]).toHaveBeenCalledWith(
      expect.objectContaining({
        currentPageIndex: 0,
        tokens: [""],
      })
    );
    const filteredShape = setStateMocks[0]?.mock.calls[0]?.[0].queryShapeKey;
    expect(filteredShape).not.toBe("table-a\u0000\u0000\u000025");

    useStateMock.mockReset();
    setStateMocks.length = 0;
    useStateMock.mockImplementationOnce(() => [
      {
        currentPageIndex: 2,
        queryShapeKey: filteredShape,
        tokens: ["", "page-2", "page-3"],
      },
      vi.fn(),
    ]);

    const changedController = useTableDataController({
      filter: nextFilter,
      name: "table-a",
      onPageSizeChange: vi.fn(),
      onSortColumnsChange: vi.fn(),
      pageSize: 25,
      sortColumns: [],
    });

    expect(changedController.currentPageIndex).toBe(0);
    expect(changedController.request.pageToken).toBe("");
    expect(changedController.request.filter).toBe(nextFilter);
  });

  test("clamps multi-sort changes and resets page tokens", () => {
    const onSortColumnsChange = vi.fn();
    const controller = useTableDataController({
      name: "table-a",
      onPageSizeChange: vi.fn(),
      onSortColumnsChange,
      pageSize: 25,
      sortColumns: [],
    });
    const nextSorts = Array.from(
      { length: MAX_SORT_COLUMNS + 2 },
      (_, index) => ({
        columnKey: `col_${index}`,
        direction: "ASC" as const,
      })
    );

    controller.setSortColumns(nextSorts);

    expect(onSortColumnsChange).toHaveBeenCalledWith(
      nextSorts.slice(-MAX_SORT_COLUMNS)
    );
    expect(setStateMocks[0]).toHaveBeenCalledWith({
      currentPageIndex: 0,
      queryShapeKey:
        "table-a\u0000col_2:ASC,col_3:ASC,col_4:ASC,col_5:ASC,col_6:ASC,col_7:ASC,col_8:ASC,col_9:ASC\u0000\u000025",
      tokens: [""],
    });
  });

  test("ignores empty next-page tokens and resets tokens on page size changes", () => {
    const onPageSizeChange = vi.fn();
    const controller = useTableDataController({
      name: "table-a",
      onPageSizeChange,
      onSortColumnsChange: vi.fn(),
      pageSize: 25,
      sortColumns: [],
    });

    controller.goNext("");
    controller.setPageSize(TEST_NUMBER_100);

    expect(setStateMocks[0]).toHaveBeenCalledTimes(1);
    expect(onPageSizeChange).toHaveBeenCalledWith(TEST_NUMBER_100);
  });

  test("pushes next tokens and clamps previous page at zero", () => {
    const controller = useTableDataController({
      name: "table-a",
      onPageSizeChange: vi.fn(),
      onSortColumnsChange: vi.fn(),
      pageSize: 25,
      sortColumns: [],
    });

    controller.goNext("page-2");
    controller.goPrev();

    const [pageTokenSetter] = setStateMocks;
    if (!pageTokenSetter) {
      throw new Error("expected page token setter");
    }
    const pushUpdater = pageTokenSetter.mock.calls[0]?.[0];
    expectPageTokenUpdater(pushUpdater);
    expect(
      pushUpdater({
        currentPageIndex: 0,
        queryShapeKey: "table-a\u0000\u0000\u000025",
        tokens: [""],
      })
    ).toEqual({
      currentPageIndex: 1,
      queryShapeKey: "table-a\u0000\u0000\u000025",
      tokens: ["", "page-2"],
    });

    const prevUpdater = pageTokenSetter.mock.calls[1]?.[0];
    expectPageTokenUpdater(prevUpdater);
    expect(
      prevUpdater({
        currentPageIndex: 0,
        queryShapeKey: "table-a\u0000\u0000\u000025",
        tokens: [""],
      })
    ).toEqual({
      currentPageIndex: 0,
      queryShapeKey: "table-a\u0000\u0000\u000025",
      tokens: [""],
    });
  });

  test("keeps token state when pushing the existing next token", () => {
    const controller = useTableDataController({
      name: "table-a",
      onPageSizeChange: vi.fn(),
      onSortColumnsChange: vi.fn(),
      pageSize: 25,
      sortColumns: [],
    });

    controller.goNext("page-2");

    const [pageTokenSetter] = setStateMocks;
    if (!pageTokenSetter) {
      throw new Error("expected page token setter");
    }
    const pushUpdater = pageTokenSetter.mock.calls[0]?.[0];
    expectPageTokenUpdater(pushUpdater);
    const previous = {
      currentPageIndex: 0,
      queryShapeKey: "table-a\u0000\u0000\u000025",
      tokens: ["", "page-2"],
    };

    expect(pushUpdater(previous)).toBe(previous);
  });
});
