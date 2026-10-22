"use client";

import { Bookmark, Loader2, Plus, X } from "lucide-react";
import { useEffect, useRef } from "react";
import { Button } from "@/components/querylane-ui/button";
import { TabsList, TabsTrigger } from "@/components/querylane-ui/tabs";
import type { SqlTab } from "@/features/sql-workbench/sql-workbench-store";

function TabIcon({ isRunning, tab }: { isRunning: boolean; tab: SqlTab }) {
  if (isRunning) {
    return (
      <Loader2
        aria-label="Running"
        className="size-3 shrink-0 motion-safe:animate-spin"
      />
    );
  }
  if (tab.savedQueryId) {
    return (
      <Bookmark
        aria-label="Saved query"
        className="text-muted-foreground size-3 shrink-0"
      />
    );
  }
  return null;
}

function SqlTabStrip({
  activeTabId,
  onAdd,
  onClose,
  runningTabIds,
  tabs,
}: {
  activeTabId: string;
  onAdd: () => void;
  onClose: (tabId: string) => void;
  runningTabIds: ReadonlySet<string>;
  tabs: SqlTab[];
}) {
  const activeTabRef = useRef<HTMLButtonElement>(null);
  const focusRequested = useRef(false);
  useEffect(
    function focusTabAfterCollectionChange() {
      if (
        focusRequested.current &&
        activeTabRef.current?.dataset["tabId"] === activeTabId
      ) {
        activeTabRef.current?.focus();
        focusRequested.current = false;
      }
    },
    [activeTabId]
  );
  const activeTab = tabs.find((tab) => tab.id === activeTabId);
  return (
    <div className="border-border bg-muted/40 flex min-h-9 items-stretch border-b">
      <div className="min-w-0 flex-1 overflow-x-auto">
        <TabsList aria-label="Query tabs" presentation="sql-workbench">
          {tabs.map((tab) => (
            <TabsTrigger
              data-tab-id={tab.id}
              key={tab.id}
              presentation="sql-workbench"
              ref={tab.id === activeTabId ? activeTabRef : undefined}
              value={tab.id}
            >
              <TabIcon isRunning={runningTabIds.has(tab.id)} tab={tab} />
              <span className="truncate">{tab.title}</span>
            </TabsTrigger>
          ))}
        </TabsList>
      </div>
      <div className="flex shrink-0 items-center gap-1 px-1">
        {activeTab ? (
          <Button
            aria-label={`Close ${activeTab.title}`}
            onClick={() => {
              focusRequested.current = true;
              onClose(activeTabId);
            }}
            presentation="muted"
            size="icon-xs"
            type="button"
            variant="ghost"
          >
            <X aria-hidden="true" className="size-3.5" />
          </Button>
        ) : null}
        <Button
          aria-label="New query tab"
          className="my-auto ml-1 size-7"
          onClick={() => {
            focusRequested.current = true;
            onAdd();
          }}
          presentation="muted"
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
