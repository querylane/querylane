"use client";

import { formatDistanceToNowStrict } from "date-fns";
import { Bookmark, History, Trash2 } from "lucide-react";
import { useState } from "react";
import { Badge } from "@/components/querylane-ui/badge";
import { Button } from "@/components/querylane-ui/button";
import { Input } from "@/components/querylane-ui/input";
import {
  Sheet,
  SheetContent,
  SheetDescription,
  SheetHeader,
  SheetTitle,
} from "@/components/querylane-ui/sheet";
import { Tabs, TabsList, TabsTrigger } from "@/components/querylane-ui/tabs";
import {
  formatDurationMs,
  formatRowCount,
  summarizeStatement,
} from "@/features/sql-workbench/sql-workbench-format";
import type {
  SavedQuery,
  SqlHistoryEntry,
} from "@/features/sql-workbench/sql-workbench-store";
import { cn } from "@/lib/utils";

type HistorySheetTab = "history" | "saved";

const PREVIEW_LENGTH = 200;
const STATUS_LABEL: Record<SqlHistoryEntry["status"], string> = {
  cancelled: "Cancelled",
  error: "Failed",
  ok: "OK",
};

function statusTone(status: SqlHistoryEntry["status"]): string {
  switch (status) {
    case "ok":
      return "text-success";
    case "error":
      return "text-destructive";
    default:
      return "text-muted-foreground";
  }
}

function historyMeta(entry: SqlHistoryEntry): string[] {
  const meta = [
    formatDistanceToNowStrict(entry.startedAt, { addSuffix: true }),
    formatDurationMs(entry.durationMs),
  ];
  if (entry.rowCount !== undefined) {
    meta.push(formatRowCount(entry.rowCount));
  }
  return meta;
}

function HistoryRow({
  entry,
  onOpen,
}: {
  entry: SqlHistoryEntry;
  onOpen: (statement: string) => void;
}) {
  return (
    <li>
      <Button
        className="h-auto w-full flex-col items-start whitespace-normal text-left"
        onClick={() => onOpen(entry.statement)}
        presentation="sql-list-row"
        type="button"
        variant="ghost"
      >
        <span className="line-clamp-2 w-full font-mono text-xs leading-relaxed">
          {summarizeStatement(entry.statement, PREVIEW_LENGTH)}
        </span>
        <span className="flex w-full flex-wrap items-center gap-x-2 text-muted-foreground text-xs">
          <span className={cn("font-medium", statusTone(entry.status))}>
            {STATUS_LABEL[entry.status]}
          </span>
          {historyMeta(entry).map((part) => (
            <span key={part}>{part}</span>
          ))}
          {entry.errorSummary ? (
            <span className="line-clamp-1 w-full text-destructive/80">
              {entry.errorSummary}
            </span>
          ) : null}
        </span>
      </Button>
    </li>
  );
}

function SavedRow({
  onDelete,
  onOpen,
  query,
}: {
  onDelete: (id: string) => void;
  onOpen: (id: string) => void;
  query: SavedQuery;
}) {
  return (
    <li className="group flex items-start gap-1">
      <Button
        className="h-auto min-w-0 flex-1 flex-col items-start whitespace-normal text-left"
        onClick={() => onOpen(query.id)}
        presentation="sql-list-row"
        type="button"
        variant="ghost"
      >
        <span className="w-full truncate font-medium text-sm">
          {query.name}
        </span>
        <span className="line-clamp-2 w-full font-mono text-muted-foreground text-xs leading-relaxed">
          {summarizeStatement(query.statement, PREVIEW_LENGTH)}
        </span>
      </Button>
      <Button
        aria-label={`Delete saved query ${query.name}`}
        className="mt-1"
        onClick={() => onDelete(query.id)}
        presentation="sql-row-delete"
        size="icon-xs"
        type="button"
        variant="ghost"
      >
        <Trash2 aria-hidden="true" className="size-3.5" />
      </Button>
    </li>
  );
}

function EmptyListMessage({ children }: { children: string }) {
  return (
    <p className="px-3 py-6 text-center text-muted-foreground text-sm">
      {children}
    </p>
  );
}

function HistoryList({
  history,
  onOpen,
  search,
}: {
  history: SqlHistoryEntry[];
  onOpen: (statement: string) => void;
  search: string;
}) {
  const needle = search.trim().toLowerCase();
  const visible = needle
    ? history.filter((entry) => entry.statement.toLowerCase().includes(needle))
    : history;
  if (history.length === 0) {
    return (
      <EmptyListMessage>
        Statements you run will be listed here.
      </EmptyListMessage>
    );
  }
  if (visible.length === 0) {
    return (
      <EmptyListMessage>No history entries match the filter.</EmptyListMessage>
    );
  }
  return (
    <ol className="flex flex-col gap-0.5">
      {visible.map((entry) => (
        <HistoryRow entry={entry} key={entry.id} onOpen={onOpen} />
      ))}
    </ol>
  );
}

function SavedList({
  onDelete,
  onOpen,
  savedQueries,
  search,
}: {
  onDelete: (id: string) => void;
  onOpen: (id: string) => void;
  savedQueries: SavedQuery[];
  search: string;
}) {
  const needle = search.trim().toLowerCase();
  const visible = needle
    ? savedQueries.filter(
        (saved) =>
          saved.name.toLowerCase().includes(needle) ||
          saved.statement.toLowerCase().includes(needle)
      )
    : savedQueries;
  if (savedQueries.length === 0) {
    return (
      <EmptyListMessage>
        Save a query from the toolbar to keep it here.
      </EmptyListMessage>
    );
  }
  if (visible.length === 0) {
    return (
      <EmptyListMessage>No saved queries match the filter.</EmptyListMessage>
    );
  }
  return (
    <ul className="flex flex-col gap-0.5">
      {visible.map((query) => (
        <SavedRow
          key={query.id}
          onDelete={onDelete}
          onOpen={onOpen}
          query={query}
        />
      ))}
    </ul>
  );
}

function SheetTabs({
  historyCount,
  onChange,
  savedCount,
  tab,
}: {
  historyCount: number;
  onChange: (tab: HistorySheetTab) => void;
  savedCount: number;
  tab: HistorySheetTab;
}) {
  return (
    <Tabs
      onValueChange={(value) =>
        onChange(value === "saved" ? "saved" : "history")
      }
      value={tab}
    >
      <TabsList className="h-8">
        <TabsTrigger className="h-7" presentation="sql-compact" value="history">
          <History aria-hidden="true" className="size-3.5" />
          History
          <Badge presentation="sql-count" variant="secondary">
            {historyCount}
          </Badge>
        </TabsTrigger>
        <TabsTrigger className="h-7" presentation="sql-compact" value="saved">
          <Bookmark aria-hidden="true" className="size-3.5" />
          Saved
          <Badge presentation="sql-count" variant="secondary">
            {savedCount}
          </Badge>
        </TabsTrigger>
      </TabsList>
    </Tabs>
  );
}

function SqlHistorySheet({
  history,
  onClearHistory,
  onDeleteSaved,
  onOpenChange,
  onOpenHistoryEntry,
  onOpenSaved,
  open,
  savedQueries,
}: {
  history: SqlHistoryEntry[];
  onClearHistory: () => void;
  onDeleteSaved: (id: string) => void;
  onOpenChange: (open: boolean) => void;
  onOpenHistoryEntry: (statement: string) => void;
  onOpenSaved: (id: string) => void;
  open: boolean;
  savedQueries: SavedQuery[];
}) {
  const [tab, setTab] = useState<HistorySheetTab>("history");
  const [search, setSearch] = useState("");
  return (
    <Sheet onOpenChange={onOpenChange} open={open}>
      <SheetContent
        className="flex flex-col"
        presentation="detail"
        side="right"
        width="detail"
      >
        <SheetHeader presentation="divided">
          <SheetTitle>Queries</SheetTitle>
          <SheetDescription>
            Recent runs and saved queries for this database, kept in this
            browser.
          </SheetDescription>
        </SheetHeader>
        <div className="flex items-center gap-2 border-border border-b px-4 py-2">
          <SheetTabs
            historyCount={history.length}
            onChange={setTab}
            savedCount={savedQueries.length}
            tab={tab}
          />
          <Input
            aria-label="Filter queries"
            className="h-8 flex-1"
            onChange={(event) => setSearch(event.target.value)}
            placeholder="Filter…"
            presentation="compact"
            value={search}
          />
        </div>
        <div className="min-h-0 flex-1 overflow-auto p-2">
          {tab === "history" ? (
            <HistoryList
              history={history}
              onOpen={onOpenHistoryEntry}
              search={search}
            />
          ) : (
            <SavedList
              onDelete={onDeleteSaved}
              onOpen={onOpenSaved}
              savedQueries={savedQueries}
              search={search}
            />
          )}
        </div>
        {tab === "history" && history.length > 0 ? (
          <div className="border-border border-t px-4 py-2">
            <Button
              onClick={onClearHistory}
              presentation="muted"
              size="xs"
              type="button"
              variant="ghost"
            >
              Clear history
            </Button>
          </div>
        ) : null}
      </SheetContent>
    </Sheet>
  );
}

export { SqlHistorySheet };
