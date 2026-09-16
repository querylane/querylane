import type { ReactNode } from "react";
import { cn } from "@/lib/utils";
import { DataValueDialog } from "./data-value-dialog";

function DataValuePreviewDialog({
  children,
  columnName,
  format,
  isTruncated,
  onOpenChange,
  raw,
  rawType,
}: {
  children: ReactNode;
  columnName: string;
  format: "JSON" | "text";
  isTruncated: boolean;
  onOpenChange: (open: boolean) => void;
  raw: string;
  rawType: string;
}) {
  return (
    <DataValueDialog
      copyLabel={`Copy ${format}`}
      description={
        format === "JSON"
          ? `Formatted ${rawType} value. Scroll the preview for large payloads.`
          : `Full ${rawType} value. Scroll the preview for long content.`
      }
      isTruncated={isTruncated}
      onOpenChange={onOpenChange}
      open={true}
      raw={raw}
      title={`${columnName} ${format}`}
    >
      <pre
        className={cn(
          "min-h-0 flex-1 overflow-auto rounded-md border bg-muted/30 p-3 font-mono text-xs",
          format === "JSON"
            ? "whitespace-pre text-permission-600 dark:text-permission-400"
            : "whitespace-pre-wrap break-words"
        )}
      >
        {children}
      </pre>
    </DataValueDialog>
  );
}

export { DataValuePreviewDialog };
