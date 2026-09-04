"use client";

import { formatDistanceToNowStrict } from "date-fns";
import { Bookmark, History, Trash2 } from "lucide-react";
import { useState } from "react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
  Sheet,
  SheetContent,
  SheetDescription,
  SheetHeader,
  SheetTitle,
} from "@/components/ui/sheet";
import { Tabs, TabsList, TabsTrigger } from "@/components/ui/tabs";
import {
  formatDurationMs,
  formatRowCount,
  summarizeStatement,
} from "@/features/sql-workbench/sql-workbench-format";
import type {
  SavedQuery,
  SqlHistoryEntry,
} from "@/features/sql-workbench/sql-workbench-store";
import { DETAIL_DRAWER_WIDTH_CLASS } from "@/lib/drawer-width";
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
        className="h-auto w-full flex-col items-start gap-1 whitespace-normal rounded-md px-3 py-2 text-left"
        onClick={() => onOpen(entry.statement)}
        type="button"
        variant="ghost"
      >
        <span className="line-clamp-2 w-full font-mono text-xs leading-relaxed">
          {summarizeStatement(entry.statement, PREVIEW_LENGTH)}
        </span>
        <span className="flex w-full flex-wrap items-center gap-x-2 text-[11px] text-muted-foreground">
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
        className="h-auto min-w-0 flex-1 flex-col items-start gap-1 whitespace-normal rounded-md px-3 py-2 text-left"
        onClick={() => onOpen(query.id)}
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
        className="mt-1 text-muted-foreground opacity-0 group-focus-within:opacity-100 group-hover:opacity-100"
        onClick={() => onDelete(query.id)}
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
        <TabsTrigger className="h-7 gap-1.5 px-2.5 text-xs" value="history">
          <History aria-hidden="true" className="size-3.5" />
          History
          <Badge className="px-1.5 font-mono text-[10px]" variant="secondary">
            {historyCount}
          </Badge>
        </TabsTrigger>
        <TabsTrigger className="h-7 gap-1.5 px-2.5 text-xs" value="saved">
          <Bookmark aria-hidden="true" className="size-3.5" />
          Saved
          <Badge className="px-1.5 font-mono text-[10px]" variant="secondary">
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
        className={cn("flex flex-col gap-0 p-0", DETAIL_DRAWER_WIDTH_CLASS)}
        side="right"
      >
        <SheetHeader className="border-border border-b">
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
            className="h-8 flex-1 text-xs"
            onChange={(event) => setSearch(event.target.value)}
            placeholder="Filter…"
            value={search}
          />
        </div>
        <div className="min-h-0 flex-1 overflow-auto px-2 py-2">
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
              className="text-muted-foreground"
              onClick={onClearHistory}
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
