"use client";

import {
  Bookmark,
  ChevronDown,
  History,
  ListOrdered,
  Loader2,
  Lock,
  Play,
  Square,
  WandSparkles,
  Waypoints,
} from "lucide-react";
import type { ReactNode } from "react";
import { Button } from "@/components/querylane-ui/button";
import {
  ButtonGroup,
  ButtonGroupSeparator,
} from "@/components/querylane-ui/button-group";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/querylane-ui/select";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuShortcut,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import {
  Tooltip,
  TooltipContent,
  TooltipTrigger,
} from "@/components/ui/tooltip";
import {
  isRowLimit,
  ROW_LIMIT_OPTIONS,
  type RowLimit,
  STATEMENT_TIMEOUT_SECONDS,
} from "@/features/sql-workbench/sql-row-limit";
import { formatCount } from "@/features/sql-workbench/sql-workbench-format";

function ShortcutHint({ keys }: { keys: string[] }) {
  return (
    <span className="ml-1 hidden items-center gap-0.5 font-mono text-xs opacity-70 sm:inline-flex">
      {keys.map((key) => (
        <kbd className="rounded border border-border/60 px-1" key={key}>
          {key}
        </kbd>
      ))}
    </span>
  );
}

/** A quiet icon-only action; its name and shortcut live in the tooltip. */
function IconAction({
  children,
  disabled = false,
  label,
  onClick,
  shortcut,
}: {
  children: ReactNode;
  disabled?: boolean | undefined;
  label: string;
  onClick: () => void;
  shortcut?: string | undefined;
}) {
  return (
    <Tooltip>
      <TooltipTrigger
        render={
          <Button
            aria-label={label}
            disabled={disabled}
            onClick={onClick}
            presentation="quiet"
            size="icon-sm"
            type="button"
            variant="ghost"
          >
            {children}
          </Button>
        }
      />
      <TooltipContent>
        {label}
        {shortcut ? (
          <span className="ml-2 font-mono opacity-70">{shortcut}</span>
        ) : null}
      </TooltipContent>
    </Tooltip>
  );
}

/**
 * The one primary control. Run executes the statement at the cursor (or the
 * selection); the attached menu holds the other ways to execute: every
 * statement in order, and the two EXPLAIN modes.
 */
function RunControl({
  canRun,
  isRunning,
  onCancel,
  onExplain,
  onRun,
  onRunAll,
  statementCount,
}: {
  canRun: boolean;
  isRunning: boolean;
  onCancel: () => void;
  onExplain: (analyze: boolean) => void;
  onRun: () => void;
  onRunAll: () => void;
  statementCount: number;
}) {
  if (isRunning) {
    return (
      <Button onClick={onCancel} size="sm" type="button" variant="destructive">
        <Square aria-hidden="true" className="size-3.5" />
        Cancel
      </Button>
    );
  }
  return (
    <ButtonGroup aria-label="Run">
      <Button
        disabled={!canRun}
        onClick={onRun}
        presentation="group-lead"
        size="sm"
        type="button"
      >
        <Play aria-hidden="true" className="size-3.5" />
        Run
        <ShortcutHint keys={["⌘", "↵"]} />
      </Button>
      <ButtonGroupSeparator presentation="on-primary" />
      <DropdownMenu>
        <DropdownMenuTrigger
          render={
            <Button
              aria-label="More ways to run"
              disabled={!canRun}
              size="icon-sm"
              type="button"
            >
              <ChevronDown aria-hidden="true" className="size-3.5" />
            </Button>
          }
        />
        <DropdownMenuContent align="start" className="min-w-64">
          <DropdownMenuItem disabled={statementCount < 2} onClick={onRunAll}>
            <ListOrdered aria-hidden="true" />
            {statementCount > 1
              ? `Run all ${statementCount} statements`
              : "Run all statements"}
            <DropdownMenuShortcut>⇧⌘↵</DropdownMenuShortcut>
          </DropdownMenuItem>
          <DropdownMenuSeparator />
          <DropdownMenuItem onClick={() => onExplain(false)}>
            <Waypoints aria-hidden="true" />
            Explain
            <DropdownMenuShortcut>estimates</DropdownMenuShortcut>
          </DropdownMenuItem>
          <DropdownMenuItem onClick={() => onExplain(true)}>
            <Waypoints aria-hidden="true" />
            Explain analyze
            <DropdownMenuShortcut>runs it</DropdownMenuShortcut>
          </DropdownMenuItem>
        </DropdownMenuContent>
      </DropdownMenu>
    </ButtonGroup>
  );
}

function RowLimitSelect({
  onChange,
  value,
}: {
  onChange: (limit: RowLimit) => void;
  value: RowLimit;
}) {
  return (
    <Select
      onValueChange={(next) => {
        const parsed = Number(next);
        if (isRowLimit(parsed)) {
          onChange(parsed);
        }
      }}
      value={String(value)}
    >
      <SelectTrigger
        aria-label="Row limit"
        className="h-8 w-auto"
        presentation="compact"
        size="sm"
      >
        <SelectValue>
          {(selected: string) => `${formatCount(Number(selected))} rows`}
        </SelectValue>
      </SelectTrigger>
      <SelectContent align="end">
        {ROW_LIMIT_OPTIONS.map((option) => (
          <SelectItem key={option} value={String(option)}>
            {formatCount(option)} rows
          </SelectItem>
        ))}
      </SelectContent>
    </Select>
  );
}

function SqlWorkbenchToolbar({
  canRun,
  historyCount,
  isExplaining,
  isRunning,
  onCancel,
  onCancelExplain,
  onExplain,
  onFormat,
  onOpenHistory,
  onRowLimitChange,
  onRun,
  onRunAll,
  onSave,
  rowLimit,
  schemaSelect,
  statementCount,
}: {
  canRun: boolean;
  historyCount: number;
  isExplaining: boolean;
  isRunning: boolean;
  onCancel: () => void;
  onCancelExplain: () => void;
  onExplain: (analyze: boolean) => void;
  onFormat: () => void;
  onOpenHistory: () => void;
  onRowLimitChange: (limit: RowLimit) => void;
  onRun: () => void;
  onRunAll: () => void;
  onSave: () => void;
  rowLimit: RowLimit;
  /** The default-schema picker, owned by the page (it reads the catalog). */
  schemaSelect?: ReactNode;
  statementCount: number;
}) {
  return (
    <div className="flex min-h-11 flex-wrap items-center gap-1 border-border border-b bg-background p-2">
      <RunControl
        canRun={canRun}
        isRunning={isRunning}
        onCancel={onCancel}
        onExplain={onExplain}
        onRun={onRun}
        onRunAll={onRunAll}
        statementCount={statementCount}
      />
      {isExplaining ? (
        <Button
          onClick={onCancelExplain}
          presentation="quiet"
          size="sm"
          type="button"
          variant="ghost"
        >
          <Loader2
            aria-hidden="true"
            className="size-3.5 motion-safe:animate-spin"
          />
          Cancel explain
        </Button>
      ) : null}
      <div className="ml-1 flex items-center">
        <IconAction label="Format" onClick={onFormat} shortcut="⇧⌘F">
          <WandSparkles aria-hidden="true" />
        </IconAction>
        <IconAction disabled={!canRun} label="Save query" onClick={onSave}>
          <Bookmark aria-hidden="true" />
        </IconAction>
        <Tooltip>
          <TooltipTrigger
            render={
              <Button
                aria-label={`History, ${historyCount} runs`}
                onClick={onOpenHistory}
                presentation="quiet"
                size="sm"
                type="button"
                variant="ghost"
              >
                <History aria-hidden="true" />
                {historyCount > 0 ? (
                  <span className="font-mono text-xs tabular-nums">
                    {historyCount}
                  </span>
                ) : null}
              </Button>
            }
          />
          <TooltipContent>History and saved queries</TooltipContent>
        </Tooltip>
      </div>
      <div className="ml-auto flex items-center gap-1.5">
        <Tooltip>
          <TooltipTrigger
            render={
              <span
                aria-label="Read-only"
                className="inline-flex size-8 cursor-help items-center justify-center text-muted-foreground"
                role="img"
              >
                <Lock aria-hidden="true" className="size-3.5" />
              </span>
            }
          />
          <TooltipContent className="max-w-xs">
            Read-only: statements run inside a read-only transaction with a{" "}
            {STATEMENT_TIMEOUT_SECONDS} second statement timeout. Writes are
            rejected by the server.
          </TooltipContent>
        </Tooltip>
        {schemaSelect}
        <RowLimitSelect onChange={onRowLimitChange} value={rowLimit} />
      </div>
    </div>
  );
}

export { SqlWorkbenchToolbar };
