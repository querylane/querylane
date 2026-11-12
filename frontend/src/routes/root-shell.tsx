import type { ErrorComponentProps } from "@tanstack/react-router";
import { Outlet } from "@tanstack/react-router";
import { lazy, Suspense } from "react";
import { AgentAccessIntegration } from "@/components/agent-access";
import { AppErrorRedirectController } from "@/components/app-error-redirect-controller";
import { AppShellFrame } from "@/components/app-shell-frame";
import { BootGate } from "@/components/boot-gate";
import { UrlListColumnsProvider } from "@/components/list-columns-provider";
import { NotFoundState } from "@/components/not-found-state";
import { RouteAnnouncer } from "@/components/route-announcer";
import { RouteErrorView } from "@/components/route-error-view";
import { Toaster } from "@/components/ui/toast";
import { DbProvider } from "@/lib/db-context";
import { ThemeProvider } from "@/theme-provider";

const LazyDatabaseLayout = lazy(() =>
  import("@/components/database-layout").then((module) => ({
    default: module.DatabaseLayout,
  }))
);

export function RootComponent() {
  return (
    <ThemeProvider defaultTheme="system">
      <AgentAccessIntegration />
      <RouteAnnouncer />
      <AppErrorRedirectController />
      <UrlListColumnsProvider>
        <BootGate>
          <DbProvider>
            <Outlet />
          </DbProvider>
        </BootGate>
      </UrlListColumnsProvider>
      <Toaster />
    </ThemeProvider>
  );
}

export function RootErrorComponent({ error, reset }: ErrorComponentProps) {
  return (
    <ThemeProvider defaultTheme="system">
      <AppShellFrame>
        <RouteErrorView error={error} reset={reset} />
      </AppShellFrame>
    </ThemeProvider>
  );
}

/**
 * The root notFoundComponent renders inside RootComponent's outlet, so the
 * providers (theme, tooltip, DbProvider) are still mounted and the real app
 * shell — header with instance selector, sidebar — can frame the 404. The
 * static AppShellFrame only bridges the lazy-chunk load.
 */
export function RootNotFoundComponent() {
  return (
    <Suspense
      fallback={
        <AppShellFrame>
          <NotFoundState />
        </AppShellFrame>
      }
    >
      <LazyDatabaseLayout>
        <NotFoundState containerClassName="min-h-[60vh]" />
      </LazyDatabaseLayout>
    </Suspense>
  );
}
