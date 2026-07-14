"use client";

import { CatchBoundary, useLocation } from "@tanstack/react-router";
import { lazy, Suspense } from "react";
import { AdminHeader } from "@/components/admin-header";
import { AdminKeyboardShortcuts } from "@/components/admin-keyboard-shortcuts";
import { KeyboardShortcutsProvider } from "@/components/keyboard-shortcuts";
import {
  SidebarInset,
  SidebarProvider,
} from "@/components/querylane-ui/sidebar";
import { RouteErrorView } from "@/components/route-error-view";
import { RouteProgressBar } from "@/components/route-progress-bar";
import type { AdminPageId } from "@/lib/admin-page";
import { ExplorerSidebarSlotProvider } from "@/lib/explorer-sidebar-slot";
import { normalizeAppUiError, reportAppUiError } from "@/lib/ui-error";
import { cn } from "@/lib/utils";
import { useSetupStore } from "@/stores/setup-store";

const AppSidebar = lazy(() =>
  import("@/components/app-sidebar").then((module) => ({
    default: module.AppSidebar,
  }))
);

function SidebarFallback({ isExplorerRoute }: { isExplorerRoute: boolean }) {
  // On the explorer route the rail mounts a database button + filter + object
  // tree. Match that shape here so the lazy-chunk hand-off doesn't morph the
  // nav skeleton into a different layout as it swaps to the real rail.
  if (isExplorerRoute) {
    return (
      <aside
        className="hidden w-(--sidebar-width) shrink-0 flex-col gap-1.5 border-r bg-sidebar px-2 pt-2 lg:flex"
        role="status"
      >
        <div className="h-8 rounded bg-sidebar-accent" />
        <div className="h-7 rounded bg-sidebar-accent" />
        <div className="mt-1 space-y-1.5 px-1">
          <div className="h-7 w-2/3 rounded bg-sidebar-accent" />
          <div className="h-7 w-1/2 rounded bg-sidebar-accent" />
          <div className="h-7 w-3/5 rounded bg-sidebar-accent" />
          <div className="h-7 w-2/5 rounded bg-sidebar-accent" />
        </div>
        <span className="sr-only">Loading object browser</span>
      </aside>
    );
  }
  return (
    <aside
      className="hidden w-(--sidebar-width) shrink-0 border-r bg-sidebar p-3 lg:flex lg:flex-col"
      role="status"
    >
      <div className="mb-4 h-8 rounded bg-sidebar-accent" />
      <div className="space-y-2">
        <div className="h-7 rounded bg-sidebar-accent" />
        <div className="h-7 rounded bg-sidebar-accent" />
        <div className="h-7 rounded bg-sidebar-accent" />
      </div>
      <span className="sr-only">Loading navigation</span>
    </aside>
  );
}

/**
 * Last-resort boundary between the shell and page content: whatever a page
 * throws during render, the header and sidebar stay mounted and interactive.
 * Resets on navigation so moving to another page recovers automatically.
 */
function ShellContentBoundary({ children }: { children: React.ReactNode }) {
  const locationKey = useLocation({ select: (location) => location.href });
  return (
    <CatchBoundary
      errorComponent={RouteErrorView}
      getResetKey={() => locationKey}
      onCatch={(error) => {
        reportAppUiError(
          normalizeAppUiError(error, {
            area: "shell-content",
            source: "runtime",
          })
        );
      }}
    >
      {children}
    </CatchBoundary>
  );
}

export function DatabaseLayout({
  children,
  page,
}: {
  children: React.ReactNode;
  page?: AdminPageId;
}) {
  const showDegradedBanner = useSetupStore((state) => state.showDegradedBanner);

  // Data Explorer renders its own full-bleed layout with an internal sidebar.
  // Use the committed page match from the parent route so pending navigations
  // keep the current page until the next route is ready.
  const isExplorerRoute = page === "database.explorer";
  const mainPaddingClass = isExplorerRoute ? "p-0" : "p-4 sm:p-6 lg:p-8";
  const mainOverflowClass = isExplorerRoute
    ? "overflow-hidden"
    : "overflow-auto";
  const isWideRoute = isExplorerRoute;
  return (
    <KeyboardShortcutsProvider>
      <SidebarProvider className="!h-svh !max-h-svh flex-col">
        <AdminKeyboardShortcuts />
        <AdminHeader />
        <ExplorerSidebarSlotProvider>
          <div
            className={cn(
              "flex min-h-0 flex-1",
              // With the object tree living in the single rail, give the
              // explorer a wider rail than the 16rem workspace default.
              isExplorerRoute && "[--sidebar-width:19rem]"
            )}
          >
            <Suspense
              fallback={<SidebarFallback isExplorerRoute={isExplorerRoute} />}
            >
              <AppSidebar page={page} />
            </Suspense>
            <SidebarInset className="relative min-w-0">
              <RouteProgressBar />
              {showDegradedBanner ? (
                <output className="block border-amber-400/40 border-b bg-amber-500/10 px-4 py-2 text-amber-700 text-xs dark:text-amber-300">
                  Meta-database unreachable. Running in degraded mode.
                </output>
              ) : null}
              <main
                className={cn(
                  // `relative` keeps absolutely-positioned descendants (e.g.
                  // sr-only labels) anchored inside this scroll container
                  // instead of escaping it and stretching the document.
                  "relative min-w-0 flex-1",
                  mainOverflowClass,
                  mainPaddingClass
                )}
              >
                <div
                  className={cn(
                    "w-full",
                    isWideRoute ? "h-full max-w-none" : "mx-auto max-w-[1200px]"
                  )}
                >
                  <ShellContentBoundary>{children}</ShellContentBoundary>
                </div>
              </main>
            </SidebarInset>
          </div>
        </ExplorerSidebarSlotProvider>
      </SidebarProvider>
    </KeyboardShortcutsProvider>
  );
}
