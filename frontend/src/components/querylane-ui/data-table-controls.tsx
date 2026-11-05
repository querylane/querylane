import { type Column, type RowData, Subscribe } from "@tanstack/react-table";
import { ArrowDown, ArrowUp, ChevronsUpDown, Search } from "lucide-react";
import type {
  DataTableFeatures,
  DataTableInstance,
  DataTableProps,
} from "@/components/querylane-ui/data-table-model";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { ListColumnSelector } from "@/components/ui/list-column-selector";
import { RefreshControl } from "@/components/ui/refresh-control";
import type { ListColumnOption } from "@/lib/list-columns";
import { cn } from "@/lib/utils";

function sortLabel(sorted: false | "asc" | "desc") {
  if (sorted === "asc") {
    return "sorted ascending";
  }
  return sorted === "desc" ? "sorted descending" : "not sorted";
}
function SortIndicator({ sorted }: { sorted: false | "asc" | "desc" }) {
  const Icon = sorted === "asc" ? ArrowUp : ArrowDown;
  if (sorted === false) {
    return (
      <ChevronsUpDown
        aria-hidden="true"
        className="text-muted-foreground/75 size-4"
        data-slot="sort-indicator"
      />
    );
  }
  return (
    <Icon
      aria-hidden="true"
      className="text-foreground size-4"
      data-slot="sort-indicator"
    />
  );
}
interface DataTableFilterProps {
  onChange: (value: string) => void;
  onCommit?: (() => void) | undefined;
  placeholder?: string | undefined;
  value: string;
}

function DataTableFilter({
  onCommit,
  onChange,
  placeholder = "Filter...",
  value,
}: DataTableFilterProps) {
  return (
    <div className="relative w-52 max-w-full shrink-0">
      <Search
        aria-hidden="true"
        className="text-muted-foreground pointer-events-none absolute top-1/2 left-2.5 size-3.5 -translate-y-1/2"
      />
      <Input
        aria-label={placeholder}
        className="h-8 pl-8 text-sm"
        name="table-filter"
        onBlur={onCommit}
        onChange={(event) => {
          onChange(event.target.value);
        }}
        onKeyDown={(event) => {
          if (event.key === "Enter") {
            onCommit?.();
          }
        }}
        placeholder={placeholder}
        value={value}
      />
    </div>
  );
}

function SortableHeader<RowValue extends RowData>({
  children,
  className,
  column,
}: {
  children: React.ReactNode;
  className?: string;
  column: Column<DataTableFeatures, RowValue>;
}) {
  const label = typeof children === "string" ? children : "Column";

  return (
    <Subscribe
      selector={(sorting) => {
        const sort = sorting.find((sortState) => sortState.id === column.id);
        if (!sort) {
          return false;
        }
        return sort.desc ? "desc" : "asc";
      }}
      source={column.table.atoms.sorting}
    >
      {(sorted) => {
        const sortStateLabel = sortLabel(sorted);

        return (
          <Button
            aria-label={`${label}, ${sortStateLabel}`}
            className={cn(
              "hover:text-foreground inline-flex h-auto cursor-pointer items-center gap-1.5 rounded-sm border-0 p-0 text-xs transition-colors hover:bg-transparent dark:hover:bg-transparent",
              className
            )}
            onClick={() => {
              column.toggleSorting();
            }}
            size="sm"
            title="Sort column"
            type="button"
            variant="ghost"
          >
            {children}
            <SortIndicator sorted={sorted} />
          </Button>
        );
      }}
    </Subscribe>
  );
}

function tableQuicksearch<RowValue extends RowData>({
  table,
  filterColumn,
  filterPlaceholder,
  isControlled,
}: {
  table: DataTableInstance<RowValue>;
  filterColumn: string | undefined;
  filterPlaceholder: string | undefined;
  isControlled: boolean;
}) {
  const quicksearch =
    filterColumn !== undefined && filterColumn !== "" && !isControlled ? (
      <DataTableFilter
        onChange={(value) =>
          table.getColumn(filterColumn)?.setFilterValue(value)
        }
        placeholder={filterPlaceholder}
        value={
          typeof table.getColumn(filterColumn)?.getFilterValue() === "string"
            ? String(table.getColumn(filterColumn)?.getFilterValue())
            : ""
        }
      />
    ) : null;
  return quicksearch;
}
function hasStableTableKey(key: string | undefined) {
  return key !== undefined && key !== "";
}
function DataTableToolbar<RowValue extends RowData>({
  table,
  columnSelection,
  props,
  isControlled,
}: {
  table: DataTableInstance<RowValue>;
  props: DataTableProps<RowValue>;
  columnSelection: {
    definitions: ListColumnOption[];
    visibleIds: string[];
    setSelection: (selection: string[] | undefined) => void;
  };
  isControlled: boolean;
}) {
  const {
    filterColumn,
    filterPlaceholder,
    onRefresh,
    lastFetchedLabel,
    isRefreshing,
    renderToolbarFilters,
    toolbarFilters,
  } = props;
  const quicksearch = tableQuicksearch({
    table,
    filterColumn,
    filterPlaceholder,
    isControlled,
  });
  const refreshControl =
    onRefresh !== undefined && lastFetchedLabel !== undefined ? (
      <RefreshControl
        className="text-muted-foreground text-xs"
        isRefreshing={isRefreshing}
        labelClassName="sm:not-sr-only"
        lastFetchedLabel={lastFetchedLabel}
        onRefresh={onRefresh}
      />
    ) : null;
  const toolbarFilterContent = renderToolbarFilters
    ? renderToolbarFilters()
    : toolbarFilters;
  const toolbarControls =
    Boolean(quicksearch) || Boolean(toolbarFilterContent) ? (
      <div
        className={cn(
          "flex min-w-0 flex-wrap items-center gap-2",
          Boolean(refreshControl) && "flex-1"
        )}
      >
        {quicksearch}
        {toolbarFilterContent}
      </div>
    ) : null;

  const columnSelector = hasStableTableKey(props.tableKey) ? (
    <ListColumnSelector
      columns={columnSelection.definitions}
      setSelection={columnSelection.setSelection}
      visibleIds={columnSelection.visibleIds}
    />
  ) : null;
  if (!(toolbarControls || refreshControl || columnSelector)) {
    return null;
  }
  return (
    <div
      className={cn(
        "flex min-h-8 flex-wrap items-center gap-2",
        refreshControl ? "justify-between" : "justify-end"
      )}
    >
      {toolbarControls}
      <div className="flex items-center gap-2">
        {columnSelector}
        {refreshControl}
      </div>
    </div>
  );
}

export { DataTableFilter, DataTableToolbar, SortableHeader };
