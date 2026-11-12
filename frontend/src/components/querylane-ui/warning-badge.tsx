import type { ReactNode } from "react";

export function WarningBadge({ children }: { children: ReactNode }) {
  return (
    <span className="inline-flex h-5 w-fit shrink-0 items-center rounded-4xl border border-warning-500/30 bg-warning-500/10 px-2 py-0.5 text-xs font-medium whitespace-nowrap text-warning-700 dark:text-warning-300">
      {children}
    </span>
  );
}
