import { ArrowDownUp, GripVertical, Plus, X } from "lucide-react";
import type { CSSProperties, DragEvent } from "react";
import { useState } from "react";
import type { SortColumn } from "react-data-grid";
import { DataGridPopoverContent } from "@/components/data-grid/table-data-grid/data-grid-popover-content";
import { SelectValue } from "@/components/select-extensions";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Popover, PopoverTrigger } from "@/components/ui/popover";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
} from "@/components/ui/select";
import { MAX_SORT_COLUMNS } from "@/features/data-explorer/table-data/use-table-data-controller";
import { cn } from "@/lib/utils";
import type { TableResultColumn } from "@/protogen/querylane/console/v1alpha1/table_data_pb";

const DRAG_DATA_KEY = "application/x-querylane-sort-index";
const MIN_SORT_COLUMN_WIDTH_CH = 12;
const MAX_SORT_COLUMN_WIDTH_CH = 26;
// Covers the trigger's horizontal padding, value gap, and chevron, measured
// in mono ch units so the longest sorted column name renders untruncated.
const SORT_COLUMN_WIDTH_PADDING_CH = 5;

type SortPopoverStyle = CSSProperties & {
  "--sort-column-select-width": string;
};
function handleSortDragOver(event: DragEvent<HTMLButtonElement>) {
  if (!event.dataTransfer.types.includes(DRAG_DATA_KEY)) {
    return;
  }
  event.preventDefault();
  event.dataTransfer.dropEffect = "move";
}

interface SortPopoverProps {
  columns: TableResultColumn[];
  onChange: (next: SortColumn[]) => void;
  popoverBoundary?: HTMLElement | null | undefined;
  sortColumns: SortColumn[];
}
function SortPopover({
  columns,
  onChange,
  popoverBoundary,
  sortColumns,
}: SortPopoverProps) {
  const [draggingIndex, setDraggingIndex] = useState<number | null>(null);
  const usedKeys = new Set(sortColumns.map((sort) => sort.columnKey));
  const availableColumns = columns.filter(
    (column) => !usedKeys.has(column.columnName)
  );
  const canAddMore =
    sortColumns.length < MAX_SORT_COLUMNS && availableColumns.length > 0;
  const longestSortedColumnNameLength = Math.max(
    ...sortColumns.map((sort) => sort.columnKey.length),
    MIN_SORT_COLUMN_WIDTH_CH - SORT_COLUMN_WIDTH_PADDING_CH
  );
  const columnSelectWidthCh = Math.min(
    Math.max(
      longestSortedColumnNameLength + SORT_COLUMN_WIDTH_PADDING_CH,
      MIN_SORT_COLUMN_WIDTH_CH
    ),
    MAX_SORT_COLUMN_WIDTH_CH
  );
  const popoverStyle: SortPopoverStyle = {
    "--sort-column-select-width": `${columnSelectWidthCh}ch`,
  };
  function updateAt(index: number, next: SortColumn) {
    const updated = sortColumns.slice();
    updated[index] = next;
    onChange(updated);
  }
  function removeAt(index: number) {
    const updated = sortColumns.slice();
    updated.splice(index, 1);
    onChange(updated);
  }
  function moveAt(from: number, to: number) {
    if (from === to || from < 0 || to < 0) {
      return;
    }
    const next = sortColumns.slice();
    const [item] = next.splice(from, 1);
    if (!item) {
      return;
    }
    next.splice(to, 0, item);
    onChange(next);
  }
  function addColumn(columnKey: string | null) {
    if (!columnKey) {
      return;
    }
    onChange([
      ...sortColumns,
      {
        columnKey,
        direction: "ASC",
      },
    ]);
  }
  return (
    <Popover>
      <PopoverTrigger
        render={
          <Button size="sm" type="button" variant="outline">
            <ArrowDownUp className="size-3.5" />
            Sort
            {sortColumns.length > 0 ? (
              <Badge
                className="ml-0.5 h-4 px-1 font-mono text-[10px]"
                variant="secondary"
              >
                {sortColumns.length}
              </Badge>
            ) : null}
          </Button>
        }
      />
      <DataGridPopoverContent
        align="end"
        aria-label="Sort rows"
        className="w-fit min-w-64 max-w-[min(calc(100vw-1rem),var(--available-width))] space-y-1.5 overflow-hidden p-2"
        collisionBoundary={popoverBoundary ?? undefined}
        style={popoverStyle}
      >
        <div className="flex items-center justify-between gap-4 px-1 text-xs">
          <span className="font-medium">Sort by</span>
          {sortColumns.length > 0 ? (
            <Button
              className="text-muted-foreground"
              onClick={() => onChange([])}
              size="xs"
              type="button"
              variant="ghost"
            >
              Clear all
            </Button>
          ) : null}
        </div>

        {sortColumns.length === 0 ? (
          // Capped at the popover's min content width (min-w-64 minus p-2) so
          // the sentence wraps instead of stretching the empty popover wider
          // than it renders once sort rows exist.
          <p className="max-w-60 px-1 text-muted-foreground text-xs">
            No sort applied. Add a column or click a header in the grid.
          </p>
        ) : (
          <ul className="w-fit max-w-full space-y-1">
            {sortColumns.map((sort, index) => (
              <SortRow
                columns={columns}
                index={index}
                isDragging={draggingIndex === index}
                key={sort.columnKey}
                onChange={(next) => updateAt(index, next)}
                onDragEnd={() => setDraggingIndex(null)}
                onDragStart={() => setDraggingIndex(index)}
                onDrop={(fromIndex) => moveAt(fromIndex, index)}
                onRemove={() => removeAt(index)}
                sort={sort}
                usedKeys={usedKeys}
              />
            ))}
          </ul>
        )}

        <Select disabled={!canAddMore} onValueChange={addColumn} value="">
          <SelectTrigger
            aria-label="Add sort column"
            className="w-full"
            size="sm"
          >
            <Plus className="size-3.5 text-muted-foreground" />
            <SelectValue placeholder="Add sort column" />
          </SelectTrigger>
          <SelectContent>
            {availableColumns.map((column) => (
              <SelectItem
                key={column.columnName}
                label={column.columnName}
                value={column.columnName}
              >
                <span className="flex w-full min-w-0">
                  <span
                    className="min-w-0 truncate font-mono text-xs"
                    title={column.columnName}
                  >
                    {column.columnName}
                  </span>
                </span>
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
        {sortColumns.length >= MAX_SORT_COLUMNS ? (
          <p className="px-1 text-[11px] text-muted-foreground">
            Maximum {MAX_SORT_COLUMNS} sort columns.
          </p>
        ) : null}
      </DataGridPopoverContent>
    </Popover>
  );
}
interface SortRowProps {
  columns: TableResultColumn[];
  index: number;
  isDragging: boolean;
  onChange: (next: SortColumn) => void;
  onDragEnd: () => void;
  onDragStart: () => void;
  onDrop: (fromIndex: number) => void;
  onRemove: () => void;
  sort: SortColumn;
  usedKeys: Set<string>;
}
function SortRow({
  columns,
  index,
  isDragging,
  onChange,
  onDragEnd,
  onDragStart,
  onDrop,
  onRemove,
  sort,
  usedKeys,
}: SortRowProps) {
  const swapColumn = (next: string | null) => {
    if (!next) {
      return;
    }
    onChange({
      columnKey: next,
      direction: sort.direction,
    });
  };
  const swapDirection = (next: "ASC" | "DESC" | null) => {
    if (!next) {
      return;
    }
    onChange({
      columnKey: sort.columnKey,
      direction: next,
    });
  };
  function handleDragStart(event: React.DragEvent<HTMLButtonElement>) {
    event.dataTransfer.setData(DRAG_DATA_KEY, String(index));
    event.dataTransfer.effectAllowed = "move";
    onDragStart();
  }
  function handleDrop(event: React.DragEvent<HTMLButtonElement>) {
    const raw = event.dataTransfer.getData(DRAG_DATA_KEY);
    if (!raw) {
      return;
    }
    event.preventDefault();
    const from = Number.parseInt(raw, 10);
    if (Number.isNaN(from)) {
      return;
    }
    onDrop(from);
  }
  return (
    <li
      className={cn(
        "group/sort-row flex items-center gap-1 rounded-md transition-opacity",
        isDragging && "opacity-40"
      )}
    >
      <Button
        aria-label={`Drag sort column ${index + 1} to reorder`}
        className="cursor-grab active:cursor-grabbing"
        draggable={true}
        onDragEnd={onDragEnd}
        onDragOver={handleSortDragOver}
        onDragStart={handleDragStart}
        onDrop={handleDrop}
        size="icon-sm"
        title="Drag to reorder"
        type="button"
        variant="ghost"
      >
        <GripVertical
          aria-hidden={true}
          className="size-3.5 shrink-0 text-muted-foreground/60 group-hover/sort-row:text-foreground"
        />
      </Button>
      <Select onValueChange={swapColumn} value={sort.columnKey}>
        <SelectTrigger
          className="w-[min(var(--sort-column-select-width),calc(100vw-12rem))] max-w-full font-mono"
          size="sm"
        >
          <SelectValue />
        </SelectTrigger>
        <SelectContent>
          {columns.reduce<React.ReactNode[]>((items, column) => {
            if (
              column.columnName !== sort.columnKey &&
              usedKeys.has(column.columnName)
            ) {
              return items;
            }

            items.push(
              <SelectItem
                key={column.columnName}
                label={column.columnName}
                value={column.columnName}
              >
                <span className="flex w-full min-w-0">
                  <span
                    className="min-w-0 truncate font-mono text-xs"
                    title={column.columnName}
                  >
                    {column.columnName}
                  </span>
                </span>
              </SelectItem>
            );
            return items;
          }, [])}
        </SelectContent>
      </Select>
      <Select onValueChange={swapDirection} value={sort.direction}>
        <SelectTrigger className="w-20" size="sm">
          <SelectValue />
        </SelectTrigger>
        <SelectContent>
          <SelectItem label="ASC" value="ASC">
            ASC
          </SelectItem>
          <SelectItem label="DESC" value="DESC">
            DESC
          </SelectItem>
        </SelectContent>
      </Select>
      <Button
        aria-label="Remove sort"
        className="shrink-0"
        onClick={onRemove}
        size="icon-sm"
        type="button"
        variant="ghost"
      >
        <X />
      </Button>
    </li>
  );
}

export { SortPopover };
