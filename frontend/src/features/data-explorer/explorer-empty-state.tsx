"use client";

import { Database as DatabaseIcon } from "lucide-react";

export function ExplorerEmptyState({
  hasError = false,
}: {
  hasError?: boolean;
}) {
  return (
    <div className="flex min-h-[60vh] flex-col items-center justify-center gap-3 text-center">
      <DatabaseIcon className="size-10 text-muted-foreground/40" />
      <h2 className="font-semibold text-lg">{"Data Explorer"}</h2>
      <p className="max-w-sm text-muted-foreground text-sm">
        {hasError
          ? "The linked schema or resource could not be loaded."
          : "Select a schema or any resource from the tree on the left to see its details."}
      </p>
    </div>
  );
}
