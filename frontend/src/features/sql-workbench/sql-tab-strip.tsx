"use client";

import { Bookmark, Loader2, Plus, X } from "lucide-react";
import { Button } from "@/components/ui/button";
import type { SqlTab } from "@/features/sql-workbench/sql-workbench-store";
import { cn } from "@/lib/utils";

function TabIcon({ isRunning, tab }: { isRunning: boolean; tab: SqlTab }) {
  if (isRunning) {
    return (
      <Loader2 aria-label="Running" className="size-3 shrink-0 animate-spin" />
    );
  }
  if (tab.savedQueryId) {
    return (
      <Bookmark
        aria-label="Saved query"
        className="size-3 shrink-0 text-muted-foreground"
      />
    );
  }
  return null;
}

function TabItem({
  isActive,
  isRunning,
  onClose,
  onSelect,
  tab,
}: {
  isActive: boolean;
  isRunning: boolean;
  onClose: (tabId: string) => void;
  onSelect: (tabId: string) => void;
  tab: SqlTab;
}) {
  return (
    <div
      className={cn(
        "group relative flex shrink-0 items-stretch border-border border-r",
        isActive && "bg-background"
      )}
    >
      <Button
        aria-selected={isActive}
        className={cn(
          "h-auto max-w-56 justify-start gap-1.5 rounded-none py-1.5 pr-1 pl-3 text-xs hover:bg-transparent focus-visible:ring-inset",
          isActive
            ? "font-medium text-foreground"
            : "text-muted-foreground hover:text-foreground"
        )}
        onClick={() => onSelect(tab.id)}
        role="tab"
        size="sm"
        type="button"
        variant="ghost"
      >
        <TabIcon isRunning={isRunning} tab={tab} />
        <span className="truncate">{tab.title}</span>
      </Button>
      <Button
        aria-label={`Close ${tab.title}`}
        className={cn(
          "my-auto mr-1 size-5 text-muted-foreground",
          !isActive &&
            "opacity-0 group-focus-within:opacity-100 group-hover:opacity-100"
        )}
        onClick={() => onClose(tab.id)}
        size="icon-xs"
        type="button"
        variant="ghost"
      >
        <X aria-hidden="true" className="size-3" />
      </Button>
      {isActive ? (
        <span
          aria-hidden="true"
          className="absolute inset-x-0 -bottom-px h-px bg-background"
        />
      ) : null}
    </div>
  );
}

function SqlTabStrip({
  activeTabId,
  onAdd,
  onClose,
  onSelect,
  runningTabIds,
  tabs,
}: {
  activeTabId: string;
  onAdd: () => void;
  onClose: (tabId: string) => void;
  onSelect: (tabId: string) => void;
  runningTabIds: ReadonlySet<string>;
  tabs: SqlTab[];
}) {
  return (
    <div className="flex min-h-9 items-stretch border-border border-b bg-muted/40">
      <div
        aria-label="Query tabs"
        className="flex min-w-0 flex-1 items-stretch overflow-x-auto"
        role="tablist"
      >
        {tabs.map((tab) => (
          <TabItem
            isActive={tab.id === activeTabId}
            isRunning={runningTabIds.has(tab.id)}
            key={tab.id}
            onClose={onClose}
            onSelect={onSelect}
            tab={tab}
          />
        ))}
        <Button
          aria-label="New query tab"
          className="my-auto ml-1 size-7 text-muted-foreground"
          onClick={onAdd}
          size="icon-xs"
          type="button"
          variant="ghost"
        >
          <Plus aria-hidden="true" className="size-3.5" />
        </Button>
      </div>
    </div>
  );
}

export { SqlTabStrip };
