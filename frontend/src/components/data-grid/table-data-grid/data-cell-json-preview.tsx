import { Copy, Maximize2 } from "lucide-react";
import {
  formatJsonPreview,
  formatPrettyJson,
  JSON_TITLE_MAX_LENGTH,
  truncateForAttribute,
} from "@/components/data-grid/table-data-grid/data-cell-preview-format";
import { writeClipboard } from "@/components/data-grid/table-data-grid/grid-clipboard";
import { useDataValueDialogState } from "@/components/data-grid/table-data-grid/use-data-value-dialog-state";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { cn } from "@/lib/utils";

interface JsonPreviewProps {
  columnName: string;
  isTruncated: boolean;
  raw: string;
  rawType: string;
}

function JsonPreview({
  columnName,
  isTruncated,
  raw,
  rawType,
}: JsonPreviewProps) {
  const { onOpenChange, open, openDialog } = useDataValueDialogState();
  const preview = formatJsonPreview(raw);
  const pretty = open ? formatPrettyJson(raw) : "";
  const title = truncateForAttribute(raw, JSON_TITLE_MAX_LENGTH);

  return (
    <span className="flex min-w-0 flex-1 items-center gap-2">
      <code
        className="block min-w-0 flex-1 truncate whitespace-nowrap font-mono text-violet-600 text-xs dark:text-violet-400"
        data-testid={`${columnName}-json-preview`}
        title={title}
      >
        {preview}
      </code>
      <Button
        aria-label={`View full JSON for ${columnName}`}
        className="h-5 shrink-0 px-1.5 text-muted-foreground"
        onClick={(event) => {
          event.stopPropagation();
          openDialog();
        }}
        onMouseDown={(event) => event.stopPropagation()}
        size="xs"
        type="button"
        variant="ghost"
      >
        <Maximize2 className="size-3" />
      </Button>
      {open ? (
        <Dialog onOpenChange={onOpenChange} open={open}>
          <DialogContent className="!flex !max-w-[calc(100vw-2rem)] max-h-[calc(100dvh-2rem)] w-[min(72rem,calc(100vw-2rem))] flex-col gap-4 overflow-hidden">
            <DialogHeader className="shrink-0 pr-10">
              <DialogTitle>
                {columnName}
                {" JSON"}
              </DialogTitle>
              <DialogDescription>
                {"Formatted "}
                {rawType}
                {" value. Scroll the preview for large payloads."}
              </DialogDescription>
            </DialogHeader>
            {isTruncated ? (
              <p className="rounded-md border border-amber-500/30 bg-amber-500/10 px-3 py-2 text-amber-700 text-xs dark:text-amber-300">
                {
                  "This cell preview is truncated. Open the row detail drawer to load the full value."
                }
              </p>
            ) : null}
            <pre
              className={cn(
                "min-h-0 flex-1 overflow-auto rounded-md border bg-muted/30 p-3",
                "whitespace-pre font-mono text-violet-600 text-xs dark:text-violet-400"
              )}
            >
              {pretty}
            </pre>
            <div className="flex shrink-0 justify-end">
              <Button
                onClick={() => writeClipboard(raw)}
                size="sm"
                type="button"
                variant="outline"
              >
                <Copy className="size-3.5" />
                {"Copy JSON"}
              </Button>
            </div>
          </DialogContent>
        </Dialog>
      ) : null}
    </span>
  );
}

export { JsonPreview };
