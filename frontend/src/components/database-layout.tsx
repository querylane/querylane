"use client";

import { CatchBoundary, useLocation } from "@tanstack/react-router";
import { lazy, Suspense } from "react";
import { AdminHeader } from "@/components/admin-header";
import { AdminKeyboardShortcuts } from "@/components/admin-keyboard-shortcuts";
import { DEFAULT_CONFIG_FILE_PATH } from "@/components/config-managed-guidance";
import { InternalStorageRecoveryDialog } from "@/components/internal-storage-recovery";
import { KeyboardShortcutsProvider } from "@/components/keyboard-shortcuts";
import { CommandPaletteProvider } from "@/components/querylane-ui/admin-command-palette";
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
  const configFilePath = useSetupStore(
    (state) =>
      (state.onboardingState?.configFilePath ?? "") || DEFAULT_CONFIG_FILE_PATH
  );

  const isExplorerRoute =
    page === "database.explorer" ||
    page === "database.sql" ||
    page === "database.workbench";
  const isFullBleedRoute = isExplorerRoute;
  const mainPaddingClass = isFullBleedRoute ? "p-0" : "p-4 sm:p-6 lg:p-8";
  const mainOverflowClass = isFullBleedRoute
    ? "overflow-hidden"
    : "overflow-auto";
  const isWideRoute = isFullBleedRoute;
  return (
    <KeyboardShortcutsProvider>
      <CommandPaletteProvider>
        <SidebarProvider
          className={cn(
            "!h-svh !max-h-svh",
            isExplorerRoute && "[--sidebar-width:19rem]"
          )}
        >
          <AdminKeyboardShortcuts />
          <ExplorerSidebarSlotProvider>
            <div className="flex min-h-0 min-w-0 flex-1">
              <Suspense
                fallback={<SidebarFallback isExplorerRoute={isExplorerRoute} />}
              >
                <AppSidebar page={page} />
              </Suspense>
              <SidebarInset className="relative min-w-0">
                <AdminHeader />
                <RouteProgressBar />
                {showDegradedBanner ? (
                  <div className="flex flex-wrap items-center justify-between gap-2 border-b border-destructive/30 bg-destructive/10 px-4 py-2 text-xs text-destructive">
                    <output>
                      Meta database unavailable. Querylane is running in
                      degraded mode.
                    </output>
                    <InternalStorageRecoveryDialog
                      configFilePath={configFilePath}
                    />
                  </div>
                ) : null}
                <div
                  className={cn(
                    "relative min-w-0 flex-1 [:root:active-view-transition-type(page-navigation)_&]:[view-transition-name:page-content]",
                    mainOverflowClass,
                    mainPaddingClass
                  )}
                >
                  <div
                    className={cn(
                      "w-full",
                      isWideRoute
                        ? "h-full max-w-none"
                        : "mx-auto max-w-[1200px]"
                    )}
                  >
                    <ShellContentBoundary>{children}</ShellContentBoundary>
                  </div>
                </div>
              </SidebarInset>
            </div>
          </ExplorerSidebarSlotProvider>
        </SidebarProvider>
      </CommandPaletteProvider>
    </KeyboardShortcutsProvider>
  );
}
