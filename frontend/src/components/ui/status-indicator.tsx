"use client";

import type * as React from "react";
import { cn } from "@/lib/utils";
import type { DbConnectionStatus } from "@/lib/console-resources";

const STATUS_STYLES: Record<DbConnectionStatus, string> = {
  connected: "bg-success",
  disconnected: "bg-muted-foreground/50",
  error: "bg-destructive",
};

const STATUS_LABELS: Record<DbConnectionStatus, string> = {
  connected: "Connected",
  disconnected: "Disconnected",
  error: "Error",
};

interface StatusIndicatorProps extends React.ComponentProps<"span"> {
  label?: string;
  showLabel?: boolean;
  status: DbConnectionStatus;
}

function StatusIndicator({
  className,
  label,
  showLabel = true,
  status,
  ...props
}: StatusIndicatorProps) {
  const resolvedLabel = label ?? STATUS_LABELS[status];

  return (
    <span
      className={cn("inline-flex items-center gap-1.5", className)}
      data-status={status}
      {...props}
    >
      <span
        aria-hidden="true"
        className={cn("size-2 shrink-0 rounded-full", STATUS_STYLES[status])}
      />
      {showLabel ? (
        resolvedLabel
      ) : (
        <span className="sr-only">{resolvedLabel}</span>
      )}
    </span>
  );
}

export { StatusIndicator };
