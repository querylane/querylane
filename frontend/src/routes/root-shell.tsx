import type { ErrorComponentProps } from "@tanstack/react-router";
import { Outlet } from "@tanstack/react-router";
import { lazy, Suspense, useEffect, useState } from "react";
import { AppErrorRedirectController } from "@/components/app-error-redirect-controller";
import { AppShellFrame } from "@/components/app-shell-frame";
import { BootGate } from "@/components/boot-gate";
import { NotFoundState } from "@/components/not-found-state";
import { RouteAnnouncer } from "@/components/route-announcer";
import { RouteErrorView } from "@/components/route-error-view";
import { SetupProvider } from "@/components/setup-provider";
import { TooltipProvider } from "@/components/ui/tooltip";
import { DbProvider } from "@/lib/db-context";
import { ThemeProvider } from "@/theme-provider";

const Toaster = lazy(() =>
  import("@/components/querylane-ui/sonner").then((module) => ({
    default: module.Toaster,
  }))
);

const LazyDatabaseLayout = lazy(() =>
  import("@/components/database-layout").then((module) => ({
    default: module.DatabaseLayout,
  }))
);

function DeferredToaster() {
  const [mounted, setMounted] = useState(false);

  useEffect(function deferToasterMount() {
    const timeout = globalThis.setTimeout(() => setMounted(true), 0);
    return () => globalThis.clearTimeout(timeout);
  }, []);

  if (!mounted) {
    return null;
  }
  return (
    <Suspense fallback={null}>
      <Toaster />
    </Suspense>
  );
}

export function RootComponent() {
  return (
    <ThemeProvider defaultTheme="system">
      <TooltipProvider>
        <RouteAnnouncer />
        <SetupProvider>
          <AppErrorRedirectController />
          <BootGate>
            <DbProvider>
              <Outlet />
            </DbProvider>
          </BootGate>
        </SetupProvider>
        <DeferredToaster />
      </TooltipProvider>
    </ThemeProvider>
  );
}

export function RootErrorComponent({ error, reset }: ErrorComponentProps) {
  return (
    <ThemeProvider defaultTheme="system">
      <TooltipProvider>
        <AppShellFrame>
          <RouteErrorView error={error} reset={reset} />
        </AppShellFrame>
      </TooltipProvider>
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
