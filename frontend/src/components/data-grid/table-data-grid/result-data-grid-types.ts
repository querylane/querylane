import type {
  TableFilterLogic,
  TableFilterRule,
} from "@/features/data-explorer/table-data/filter-state";
import type { TableCell } from "@/protogen/querylane/console/v1alpha1/table_data_pb";

/** Empty-grid copy a caller can replace (query results explain their own). */
interface GridEmptyMessage {
  description: string;
  title: string;
}

interface ResultRow {
  rowKey: string;
  values: TableCell[];
}

interface ResultDataGridFilters {
  logic: TableFilterLogic;
  onChange: (
    nextRules: TableFilterRule[],
    nextLogic?: TableFilterLogic
  ) => void;
  rules: TableFilterRule[];
  title: string;
}

interface ResultDataGridRefresh {
  isFetching: boolean;
  lastFetchedLabel: string;
  onRefresh: () => Promise<unknown> | undefined;
}

interface ResultDataGridPagination {
  currentPageIndex: number;
  hasNext: boolean;
  onNext: () => void;
  onPageSizeChange: (next: number) => void;
  onPrev: () => void;
  pageLabel: string;
  pageSize: number;
}

export type {
  GridEmptyMessage,
  ResultDataGridFilters,
  ResultDataGridPagination,
  ResultDataGridRefresh,
  ResultRow,
};
