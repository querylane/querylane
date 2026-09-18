import { ArrowDown, ArrowUp, Columns3 } from "lucide-react";
import { useId } from "react";
import { DataGridPopoverContent } from "@/components/data-grid/table-data-grid/data-grid-popover-content";
import { Badge } from "@/components/querylane-ui/badge";
import { Button } from "@/components/querylane-ui/button";
import { Label } from "@/components/querylane-ui/label";
import { Checkbox } from "@/components/ui/checkbox";
import { Popover, PopoverTrigger } from "@/components/ui/popover";
import { Switch } from "@/components/ui/switch";
import {
  Tooltip,
  TooltipContent,
  TooltipTrigger,
} from "@/components/ui/tooltip";
import { cn } from "@/lib/utils";
import type { TableResultColumn } from "@/protogen/querylane/console/v1alpha1/table_data_pb";

interface ColumnsPopoverProps {
  columnOrder: readonly string[];
  columns: TableResultColumn[];
  fetchVisibleColumns: boolean;
  hiddenColumnKeys: ReadonlySet<string>;
  isCustomized: boolean;
  onFetchVisibleColumnsChange: (enabled: boolean) => void;
  onOrderChange: (columnOrder: string[]) => void;
  onReset: () => void;
  onVisibilityChange: (columnKey: string, visible: boolean) => void;
  popoverBoundary?: HTMLElement | null | undefined;
}

function ColumnsPopover({
  columnOrder,
  columns,
  fetchVisibleColumns,
  hiddenColumnKeys,
  isCustomized,
  onFetchVisibleColumnsChange,
  onOrderChange,
  onReset,
  onVisibilityChange,
  popoverBoundary,
}: ColumnsPopoverProps) {
  const fetchVisibleDescriptionId = useId();
  const lastVisibleReasonId = useId();
  const visibleCount = columns.length - hiddenColumnKeys.size;
  const columnByName = new Map(
    columns.map((column) => [column.columnName, column])
  );
  const orderedColumns = columnOrder.flatMap((columnName) => {
    const column = columnByName.get(columnName);
    return column ? [column] : [];
  });

  function moveAt(from: number, to: number) {
    if (from === to || from < 0 || to < 0) {
      return;
    }
    const next = columnOrder.slice();
    const [columnName] = next.splice(from, 1);
    if (!columnName) {
      return;
    }
    next.splice(to, 0, columnName);
    onOrderChange(next);
  }

  return (
    <Popover>
      <PopoverTrigger
        render={
          <Button size="sm" type="button" variant="outline">
            <Columns3 className="size-3.5" />
            Columns
            {hiddenColumnKeys.size > 0 ? (
              <Badge
                aria-hidden={true}
                className="ml-0.5 h-4"
                presentation="count"
                title={`${hiddenColumnKeys.size} hidden`}
                variant="secondary"
              >
                {hiddenColumnKeys.size}
              </Badge>
            ) : null}
          </Button>
        }
      />
      <DataGridPopoverContent
        align="end"
        aria-label="Manage columns"
        className="w-72 gap-2 p-3"
        collisionBoundary={popoverBoundary ?? undefined}
      >
        <div className="flex items-center justify-between gap-2">
          <p className="font-medium text-xs">Columns</p>
          <Button
            aria-label="Reset columns"
            className="h-6"
            disabled={!isCustomized}
            onClick={onReset}
            presentation="compact"
            size="sm"
            type="button"
            variant="ghost"
          >
            Reset
          </Button>
        </div>
        <div className="flex items-start justify-between gap-3 rounded-md border bg-muted/30 p-2.5">
          <div className="min-w-0">
            <p className="font-medium text-xs">Fetch visible columns only</p>
            <p
              className="mt-0.5 text-muted-foreground text-xs"
              id={fetchVisibleDescriptionId}
            >
              Excludes hidden columns from row payloads while keeping them
              available to filters and sorting.
            </p>
          </div>
          <Switch
            aria-describedby={fetchVisibleDescriptionId}
            aria-label="Fetch visible columns only"
            checked={fetchVisibleColumns}
            onCheckedChange={onFetchVisibleColumnsChange}
            size="sm"
          />
        </div>
        <ul className="max-h-80 space-y-1 overflow-y-auto pr-1">
          {orderedColumns.map((column, index) => {
            const visible = !hiddenColumnKeys.has(column.columnName);
            const isLastVisible = visible && visibleCount === 1;
            const visibilityControl = (
              <Label
                className={cn(
                  "min-w-0 flex-1",
                  isLastVisible ? "cursor-not-allowed" : "cursor-pointer"
                )}
                presentation="column"
              >
                <Checkbox
                  aria-describedby={
                    isLastVisible ? lastVisibleReasonId : undefined
                  }
                  checked={visible}
                  disabled={isLastVisible}
                  onCheckedChange={(checked) =>
                    onVisibilityChange(column.columnName, checked)
                  }
                />
                <span className="min-w-0 truncate font-mono text-xs">
                  {column.columnName}
                </span>
              </Label>
            );
            return (
              <li
                className="flex min-h-8 items-center gap-1 rounded-md"
                key={column.columnName}
              >
                {isLastVisible ? (
                  <Tooltip>
                    <TooltipTrigger
                      render={
                        <span className="flex min-w-0 flex-1 cursor-not-allowed" />
                      }
                    >
                      {visibilityControl}
                    </TooltipTrigger>
                    <TooltipContent>
                      At least one column must remain visible.
                    </TooltipContent>
                  </Tooltip>
                ) : (
                  visibilityControl
                )}
                <span className="ml-auto flex shrink-0 items-center gap-0.5">
                  <Button
                    aria-label={`Move ${column.columnName} up`}
                    className="size-7"
                    disabled={index === 0}
                    onClick={() => moveAt(index, index - 1)}
                    presentation="unpadded"
                    type="button"
                    variant="ghost"
                  >
                    <ArrowUp className="size-3.5" />
                  </Button>
                  <Button
                    aria-label={`Move ${column.columnName} down`}
                    className="size-7"
                    disabled={index === orderedColumns.length - 1}
                    onClick={() => moveAt(index, index + 1)}
                    presentation="unpadded"
                    type="button"
                    variant="ghost"
                  >
                    <ArrowDown className="size-3.5" />
                  </Button>
                </span>
              </li>
            );
          })}
        </ul>
        <span className="sr-only" id={lastVisibleReasonId}>
          At least one column must remain visible.
        </span>
      </DataGridPopoverContent>
    </Popover>
  );
}

export { ColumnsPopover };
