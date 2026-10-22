"use client";

import { Database as DatabaseIcon } from "lucide-react";

export function ExplorerEmptyState({
  hasError = false,
}: {
  hasError?: boolean;
}) {
  return (
    <div className="flex min-h-0 flex-1 flex-col items-center justify-center gap-3 p-6 text-center">
      <DatabaseIcon className="text-muted-foreground/40 size-10" />
      <h2 className="text-lg font-semibold">Data Explorer</h2>
      <p className="text-muted-foreground max-w-sm text-sm">
        {hasError
          ? "The linked schema or resource could not be loaded."
          : "Select a schema or any resource from the tree on the left to see its details."}
      </p>
    </div>
  );
}
