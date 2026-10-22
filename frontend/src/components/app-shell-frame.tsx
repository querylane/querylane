"use client";

import { Logo } from "@/components/logo";
import { ThemeModeMenu } from "@/components/theme-mode-menu";
import { useTheme } from "@/theme-provider";
import packageJson from "../../package.json" with { type: "json" };

const FRONTEND_PACKAGE_VERSION = packageJson.version;

/**
 * Static application shell for surfaces that must render without any backend
 * data (boot errors, root error boundary, pre-instance redirects). Mirrors the
 * real shell layout — full-height sidebar rail with the brand at its top, and a
 * content topbar — so error and loading states appear inside the app frame
 * instead of replacing it.
 */
function SidebarRailPlaceholder() {
  return (
    <aside className="border-border bg-sidebar hidden w-64 shrink-0 flex-col border-r lg:flex">
      <div className="flex h-12 shrink-0 items-center gap-2 px-3">
        <Logo className="size-7" logoStyle="flat" />
        <span className="text-sm font-semibold tracking-tight">Querylane</span>
      </div>
      <div aria-hidden="true" className="space-y-2 p-3 opacity-50">
        <div className="bg-sidebar-accent mb-4 h-4 w-20 rounded" />
        <div className="bg-sidebar-accent h-7 rounded" />
        <div className="bg-sidebar-accent h-7 w-4/5 rounded" />
        <div className="bg-sidebar-accent h-7 w-3/5 rounded" />
        <div className="bg-sidebar-accent mt-6 mb-4 h-4 w-24 rounded" />
        <div className="bg-sidebar-accent h-7 rounded" />
        <div className="bg-sidebar-accent h-7 w-4/5 rounded" />
      </div>
    </aside>
  );
}

export function AppShellFrame({ children }: { children: React.ReactNode }) {
  const { resolvedTheme, setTheme } = useTheme();

  return (
    <div className="bg-background flex h-svh max-h-svh">
      <SidebarRailPlaceholder />
      <main className="flex min-w-0 flex-1 flex-col">
        <header className="border-border bg-background z-20 flex h-12 shrink-0 items-center justify-end gap-2 border-b px-3 lg:px-4">
          <span className="text-muted-foreground font-mono text-xs">
            Querylane {FRONTEND_PACKAGE_VERSION}
          </span>
          <ThemeModeMenu resolvedTheme={resolvedTheme} setTheme={setTheme} />
        </header>
        <div className="flex min-h-0 flex-1 items-center justify-center overflow-auto p-4 sm:p-6 lg:p-8">
          <div className="w-full max-w-[1200px]">{children}</div>
        </div>
      </main>
    </div>
  );
}
