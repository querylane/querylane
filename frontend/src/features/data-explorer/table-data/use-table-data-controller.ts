import { create, toJsonString } from "@bufbuild/protobuf";
import { useState } from "react";
import type { SortColumn } from "react-data-grid";
import {
  CellValueMode,
  type ReadRowsRequest,
  ReadRowsRequestSchema,
  RowCountMode,
  type RowFilter,
  RowFilterSchema,
  type RowOrder,
  RowOrder_Direction,
  RowOrderSchema,
} from "@/protogen/querylane/console/v1alpha1/table_data_pb";

const MAX_SORT_COLUMNS = 8;
const INITIAL_TOKEN_STACK = [""];

interface UseTableDataControllerArgs {
  filter?: RowFilter | undefined;
  name: string;
  onPageSizeChange: (next: number) => void;
  onSortColumnsChange: (next: SortColumn[]) => void;
  pageSize: number;
  sortColumns: SortColumn[];
}

interface TableDataController {
  currentPageIndex: number;
  goNext: (token: string) => void;
  goPrev: () => void;
  pageSize: number;
  request: ReadRowsRequest;
  setPageSize: (next: number) => void;
  setSortColumns: (next: SortColumn[]) => void;
  sortColumns: SortColumn[];
}

interface PageTokenState {
  currentPageIndex: number;
  queryShapeKey: string;
  tokens: string[];
}

function toRowOrder(column: SortColumn): RowOrder {
  return create(RowOrderSchema, {
    column: column.columnKey,
    direction:
      column.direction === "ASC"
        ? RowOrder_Direction.ASC
        : RowOrder_Direction.DESC,
  });
}

function useTableDataController({
  name,
  filter,
  onPageSizeChange,
  onSortColumnsChange,
  pageSize,
  sortColumns,
}: UseTableDataControllerArgs): TableDataController {
  const queryShapeKey = buildQueryShapeKey(name, sortColumns, filter, pageSize);
  const [pageTokenState, setPageTokenState] = useState<PageTokenState>(() =>
    resetPageTokenState(queryShapeKey)
  );
  const activePageTokenState =
    pageTokenState.queryShapeKey === queryShapeKey
      ? pageTokenState
      : resetPageTokenState(queryShapeKey);

  const orderBy = sortColumns.map(toRowOrder);

  const request = create(ReadRowsRequestSchema, {
    cellValueMode: CellValueMode.PREVIEW,
    ...(filter ? { filter } : {}),
    name,
    orderBy,
    pageSize,
    pageToken:
      activePageTokenState.tokens[activePageTokenState.currentPageIndex] ?? "",
    rowCountMode: RowCountMode.ESTIMATE,
  });

  function setSortColumns(next: SortColumn[]) {
    const clamped = next.slice(-MAX_SORT_COLUMNS);
    onSortColumnsChange(clamped);
    setPageTokenState(
      resetPageTokenState(buildQueryShapeKey(name, clamped, filter, pageSize))
    );
  }

  function setPageSize(next: number) {
    onPageSizeChange(next);
    setPageTokenState(
      resetPageTokenState(buildQueryShapeKey(name, sortColumns, filter, next))
    );
  }

  function goNext(token: string) {
    if (!token) {
      return;
    }
    const fromIndex = activePageTokenState.currentPageIndex;
    setPageTokenState(function pushTokenForShape(prev) {
      const base =
        prev.queryShapeKey === queryShapeKey
          ? prev
          : resetPageTokenState(queryShapeKey);
      const tokens = pushPageToken(base.tokens, fromIndex, token);
      if (tokens === base.tokens) {
        return base;
      }
      return {
        currentPageIndex: fromIndex + 1,
        queryShapeKey,
        tokens,
      };
    });
  }

  function goPrev() {
    setPageTokenState(function movePrevForShape(prev) {
      const base =
        prev.queryShapeKey === queryShapeKey
          ? prev
          : resetPageTokenState(queryShapeKey);
      return {
        ...base,
        currentPageIndex: Math.max(0, base.currentPageIndex - 1),
      };
    });
  }

  return {
    currentPageIndex: activePageTokenState.currentPageIndex,
    goNext,
    goPrev,
    pageSize,
    request,
    setPageSize,
    setSortColumns,
    sortColumns,
  };
}

function buildQueryShapeKey(
  name: string,
  sortColumns: readonly SortColumn[],
  filter: RowFilter | undefined,
  pageSize: number
) {
  const sortKey = sortColumns
    .map((sort) => `${sort.columnKey}:${sort.direction}`)
    .join(",");
  const filterKey = filter ? toJsonString(RowFilterSchema, filter) : "";
  return `${name}\u0000${sortKey}\u0000${filterKey}\u0000${pageSize}`;
}

function resetPageTokenState(queryShapeKey: string): PageTokenState {
  return {
    currentPageIndex: 0,
    queryShapeKey,
    tokens: INITIAL_TOKEN_STACK,
  };
}

function pushPageToken(
  prev: string[],
  fromIndex: number,
  token: string
): string[] {
  if (prev[fromIndex + 1] === token) {
    return prev;
  }
  const next = prev.slice(0, fromIndex + 1);
  next.push(token);
  return next;
}

export { MAX_SORT_COLUMNS, pushPageToken, useTableDataController };
