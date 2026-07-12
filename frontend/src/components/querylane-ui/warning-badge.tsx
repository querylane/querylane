import type { ReactNode } from "react";

export function WarningBadge({ children }: { children: ReactNode }) {
  return (
    <span className="inline-flex h-5 w-fit shrink-0 items-center whitespace-nowrap rounded-4xl border border-amber-500/30 bg-amber-500/10 px-2 py-0.5 font-medium text-amber-700 text-xs dark:text-amber-300">
      {children}
    </span>
  );
}
