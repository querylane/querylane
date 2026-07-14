"use client";

import { Logo } from "@/components/logo";
import { ThemeModeMenu } from "@/components/theme-mode-menu";
import { useTheme } from "@/theme-provider";

/**
 * Static application shell for surfaces that must render without any backend
 * data (boot errors, root error boundary, pre-instance redirects). Mirrors the
 * real shell layout — header, sidebar rail, main content — so error and
 * loading states appear inside the app frame instead of replacing it.
 */
function SidebarRailPlaceholder() {
  return (
    <aside
      aria-hidden="true"
      className="hidden w-64 shrink-0 flex-col border-border border-r bg-sidebar p-3 lg:flex"
    >
      <div className="space-y-2 opacity-50">
        <div className="mb-4 h-4 w-20 rounded bg-sidebar-accent" />
        <div className="h-7 rounded bg-sidebar-accent" />
        <div className="h-7 w-4/5 rounded bg-sidebar-accent" />
        <div className="h-7 w-3/5 rounded bg-sidebar-accent" />
        <div className="mt-6 mb-4 h-4 w-24 rounded bg-sidebar-accent" />
        <div className="h-7 rounded bg-sidebar-accent" />
        <div className="h-7 w-4/5 rounded bg-sidebar-accent" />
      </div>
    </aside>
  );
}

export function AppShellFrame({ children }: { children: React.ReactNode }) {
  const { resolvedTheme, setTheme } = useTheme();

  return (
    <div className="flex h-svh max-h-svh flex-col bg-background">
      <header className="z-20 flex h-14 shrink-0 items-center justify-between border-border border-b bg-sidebar px-3 lg:px-4">
        <div className="flex items-center gap-2.5">
          <Logo className="size-8" logoStyle="flat" />
          <span className="font-semibold text-sm tracking-tight">
            {"Querylane"}
          </span>
        </div>
        <ThemeModeMenu resolvedTheme={resolvedTheme} setTheme={setTheme} />
      </header>
      <div className="flex min-h-0 flex-1">
        <SidebarRailPlaceholder />
        <main className="flex min-w-0 flex-1 items-center justify-center overflow-auto p-4 sm:p-6 lg:p-8">
          <div className="w-full max-w-[1200px]">{children}</div>
        </main>
      </div>
    </div>
  );
}
