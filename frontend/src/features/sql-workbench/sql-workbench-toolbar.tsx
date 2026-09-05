"use client";

import {
  Bookmark,
  ChevronDown,
  History,
  Loader2,
  Lock,
  Play,
  Square,
  WandSparkles,
  Waypoints,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuShortcut,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  Tooltip,
  TooltipContent,
  TooltipTrigger,
} from "@/components/ui/tooltip";
import {
  isRowLimit,
  ROW_LIMIT_OPTIONS,
  type RowLimit,
} from "@/features/sql-workbench/sql-row-limit";
import { formatCount } from "@/features/sql-workbench/sql-workbench-format";

function ShortcutHint({ keys }: { keys: string[] }) {
  return (
    <span className="ml-1 hidden items-center gap-0.5 font-mono text-[10px] opacity-70 sm:inline-flex">
      {keys.map((key) => (
        <kbd className="rounded border border-border/60 px-1" key={key}>
          {key}
        </kbd>
      ))}
    </span>
  );
}

function SqlWorkbenchToolbar({
  canRun,
  historyCount,
  isExplaining,
  isRunning,
  onCancel,
  onExplain,
  onFormat,
  onOpenHistory,
  onRowLimitChange,
  onRun,
  onRunAll,
  onSave,
  rowLimit,
  statementCount,
}: {
  canRun: boolean;
  historyCount: number;
  isExplaining: boolean;
  isRunning: boolean;
  onCancel: () => void;
  onExplain: (analyze: boolean) => void;
  onFormat: () => void;
  onOpenHistory: () => void;
  onRowLimitChange: (limit: RowLimit) => void;
  onRun: () => void;
  onRunAll: () => void;
  onSave: () => void;
  rowLimit: RowLimit;
  statementCount: number;
}) {
  return (
    <div className="flex min-h-11 flex-wrap items-center gap-1.5 border-border border-b bg-background px-2 py-1">
      {isRunning ? (
        <Button
          onClick={onCancel}
          size="sm"
          type="button"
          variant="destructive"
        >
          <Square aria-hidden="true" className="size-3.5" />
          Cancel
        </Button>
      ) : (
        <Button disabled={!canRun} onClick={onRun} size="sm" type="button">
          <Play aria-hidden="true" className="size-3.5" />
          Run
          <ShortcutHint keys={["⌘", "↵"]} />
        </Button>
      )}
      {statementCount > 1 ? (
        <Tooltip>
          <TooltipTrigger
            render={
              <Button
                disabled={!canRun || isRunning}
                onClick={onRunAll}
                size="sm"
                type="button"
                variant="outline"
              >
                Run all ({statementCount})
                <ShortcutHint keys={["⇧", "⌘", "↵"]} />
              </Button>
            }
          />
          <TooltipContent>
            Runs every statement in order and shows the last result set.
          </TooltipContent>
        </Tooltip>
      ) : null}
      <DropdownMenu>
        <DropdownMenuTrigger
          render={
            <Button
              disabled={!canRun || isExplaining}
              size="sm"
              type="button"
              variant="outline"
            >
              {isExplaining ? (
                <Loader2 aria-hidden="true" className="size-3.5 animate-spin" />
              ) : (
                <Waypoints aria-hidden="true" className="size-3.5" />
              )}
              Explain
              <ChevronDown aria-hidden="true" className="size-3 opacity-60" />
            </Button>
          }
        />
        <DropdownMenuContent align="start" className="min-w-64">
          <DropdownMenuItem onClick={() => onExplain(false)}>
            Explain
            <DropdownMenuShortcut>estimates only</DropdownMenuShortcut>
          </DropdownMenuItem>
          <DropdownMenuItem onClick={() => onExplain(true)}>
            Explain analyze
            <DropdownMenuShortcut>runs the query</DropdownMenuShortcut>
          </DropdownMenuItem>
        </DropdownMenuContent>
      </DropdownMenu>
      <Button onClick={onFormat} size="sm" type="button" variant="ghost">
        <WandSparkles aria-hidden="true" className="size-3.5" />
        Format
        <ShortcutHint keys={["⇧", "⌘", "F"]} />
      </Button>
      <Button
        disabled={!canRun}
        onClick={onSave}
        size="sm"
        type="button"
        variant="ghost"
      >
        <Bookmark aria-hidden="true" className="size-3.5" />
        Save
      </Button>
      <div className="ml-auto flex items-center gap-1.5">
        <Tooltip>
          <TooltipTrigger
            render={
              <span className="flex items-center gap-1 rounded-md border border-border px-2 py-1 text-[11px] text-muted-foreground">
                <Lock aria-hidden="true" className="size-3" />
                Read-only
              </span>
            }
          />
          <TooltipContent className="max-w-xs">
            Statements run inside a read-only transaction with a 60 second
            statement timeout. Writes are rejected by the server.
          </TooltipContent>
        </Tooltip>
        <Select
          onValueChange={(value) => {
            const parsed = Number(value);
            if (isRowLimit(parsed)) {
              onRowLimitChange(parsed);
            }
          }}
          value={String(rowLimit)}
        >
          <SelectTrigger
            aria-label="Row limit"
            className="h-8 w-auto gap-1 text-xs"
            size="sm"
          >
            <SelectValue />
          </SelectTrigger>
          <SelectContent align="end">
            {ROW_LIMIT_OPTIONS.map((option) => (
              <SelectItem key={option} value={String(option)}>
                {formatCount(option)} rows
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
        <Button onClick={onOpenHistory} size="sm" type="button" variant="ghost">
          <History aria-hidden="true" className="size-3.5" />
          History
          {historyCount > 0 ? (
            <span className="rounded-full bg-muted px-1.5 font-mono text-[10px] tabular-nums">
              {historyCount}
            </span>
          ) : null}
        </Button>
      </div>
    </div>
  );
}

export { SqlWorkbenchToolbar };
