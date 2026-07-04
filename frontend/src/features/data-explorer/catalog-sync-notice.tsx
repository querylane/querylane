"use client";

import { AlertTriangle } from "lucide-react";
import type { catalogSyncNotice } from "@/features/data-explorer/use-data-explorer-state";
import { cn } from "@/lib/utils";

type CatalogSyncNoticeModel = NonNullable<ReturnType<typeof catalogSyncNotice>>;

function CatalogSyncNotice({
  notice,
  surface,
}: {
  notice: CatalogSyncNoticeModel;
  surface: "detail" | "sidebar";
}) {
  const role = notice.tone === "warning" ? "alert" : "status";

  if (surface === "detail") {
    return (
      <div
        className={cn(
          "rounded-xl px-4 py-2 text-sm shadow-xs ring-1",
          notice.tone === "warning"
            ? "bg-amber-500/10 text-amber-700 ring-amber-500/30 dark:text-amber-300"
            : "bg-muted/50 text-muted-foreground ring-foreground/10"
        )}
        role={role}
      >
        {notice.message}
      </div>
    );
  }

  return (
    <div
      className={cn(
        "mx-2 mb-2 flex items-start gap-2 rounded-md border p-2.5 text-sm",
        notice.tone === "warning"
          ? "border-amber-500/30 bg-amber-500/10 text-amber-700 dark:text-amber-300"
          : "border-border bg-muted/50 text-muted-foreground"
      )}
      role={role}
    >
      <AlertTriangle aria-hidden="true" className="mt-0.5 size-4 shrink-0" />
      <span>{notice.message}</span>
    </div>
  );
}

export { CatalogSyncNotice };
