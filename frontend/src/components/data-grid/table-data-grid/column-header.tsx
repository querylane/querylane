import { ArrowDown, ArrowUp, KeyRound, Lock } from "lucide-react";
import { ColumnHeaderMenu } from "@/components/data-grid/table-data-grid/column-header-menu";
import { cn } from "@/lib/utils";
import type { TableResultColumn } from "@/protogen/querylane/console/v1alpha1/table_data_pb";

type SortDirection = "ASC" | "DESC";

interface ColumnHeaderProps {
  canHide: boolean;
  column: TableResultColumn;
  isFrozen: boolean;
  isPrimaryKey: boolean;
  onCopyName: () => void;
  onHide: () => void;
  onSortAsc: () => void;
  onSortDesc: () => void;
  onToggleFreeze: () => void;
  sortDirection?: SortDirection | undefined;
  sortPriority?: number | undefined;
}

function ColumnHeader({
  canHide,
  column,
  isFrozen,
  isPrimaryKey,
  onCopyName,
  onHide,
  onSortAsc,
  onSortDesc,
  onToggleFreeze,
  sortDirection,
  sortPriority,
}: ColumnHeaderProps) {
  return (
    <div className="flex h-full w-full min-w-0 items-center gap-1.5 overflow-hidden">
      <div className="flex min-w-0 flex-1 items-center gap-1.5 overflow-hidden">
        {isFrozen ? (
          <Lock
            aria-label="Frozen column"
            className="size-3 shrink-0 text-sky-500 dark:text-sky-400"
          />
        ) : null}
        {isPrimaryKey ? (
          <KeyRound
            aria-label="Primary key"
            className="size-3 shrink-0 text-amber-500"
          />
        ) : null}
        <span
          className={cn(
            "min-w-[2ch] truncate font-medium text-foreground text-xs",
            column.isNullable ? "" : "font-semibold"
          )}
        >
          {column.columnName}
        </span>
        <span className="min-w-0 truncate font-mono text-[10px] text-muted-foreground uppercase tracking-wide">
          {column.rawType}
        </span>
        {sortDirection ? (
          <span className="inline-flex shrink-0 items-center gap-0.5 text-foreground/70">
            {sortDirection === "ASC" ? (
              <ArrowUp aria-label="Sorted ascending" className="size-3" />
            ) : (
              <ArrowDown aria-label="Sorted descending" className="size-3" />
            )}
            {sortPriority ? (
              <span className="font-mono text-[10px] tabular-nums">
                {sortPriority}
              </span>
            ) : null}
          </span>
        ) : null}
      </div>
      <span className="ml-auto shrink-0">
        <ColumnHeaderMenu
          canHide={canHide}
          columnName={column.columnName}
          columnRawType={column.rawType}
          isFrozen={isFrozen}
          onCopyName={onCopyName}
          onHide={onHide}
          onSortAsc={onSortAsc}
          onSortDesc={onSortDesc}
          onToggleFreeze={onToggleFreeze}
          sortDirection={sortDirection}
        />
      </span>
    </div>
  );
}

export { ColumnHeader };
