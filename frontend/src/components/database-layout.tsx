"use client";

import { CatchBoundary, useLocation } from "@tanstack/react-router";
import { lazy, Suspense } from "react";
import { AdminHeader } from "@/components/admin-header";
import {
  SidebarInset,
  SidebarProvider,
} from "@/components/querylane-ui/sidebar";
import { RouteErrorView } from "@/components/route-error-view";
import { RouteProgressBar } from "@/components/route-progress-bar";
import type { AdminPageId } from "@/lib/admin-page";
import { normalizeAppUiError, reportAppUiError } from "@/lib/ui-error";
import { cn } from "@/lib/utils";
import { useSetupStore } from "@/stores/setup-store";

const AppSidebar = lazy(() =>
  import("@/components/app-sidebar").then((module) => ({
    default: module.AppSidebar,
  }))
);

function SidebarFallback() {
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
    <SidebarProvider className="!h-svh !max-h-svh flex-col">
      <AdminHeader />
      <div className="flex min-h-0 flex-1">
        <Suspense fallback={<SidebarFallback />}>
          <AppSidebar />
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
              // sr-only labels) anchored inside this scroll container instead
              // of escaping it and stretching the document.
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
    </SidebarProvider>
  );
}
