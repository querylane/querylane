import type { ReactNode } from "react";
import {
  ExplorerSidebarSlotProvider,
  useExplorerSidebarSlotRegistration,
} from "@/lib/explorer-sidebar-slot";

function ExplorerRailSlot() {
  const registerSlotTarget = useExplorerSidebarSlotRegistration();
  return (
    <div
      className="flex h-full w-64 shrink-0 flex-col border-border border-r bg-sidebar"
      data-testid="explorer-rail-slot"
      ref={registerSlotTarget}
    />
  );
}

/**
 * Stand-in for the app shell around DataExplorerPage: a fixed-width sidebar
 * rail registered as the explorer slot target next to the detail area, so
 * tests exercise the same portal layout the real AppSidebar provides.
 */
function ExplorerRailFrame({ children }: { children: ReactNode }) {
  return (
    <ExplorerSidebarSlotProvider>
      <div className="flex h-full min-h-0 w-full">
        <ExplorerRailSlot />
        <div className="flex h-full min-h-0 min-w-0 flex-1 flex-col">
          {children}
        </div>
      </div>
    </ExplorerSidebarSlotProvider>
  );
}

export { ExplorerRailFrame };
