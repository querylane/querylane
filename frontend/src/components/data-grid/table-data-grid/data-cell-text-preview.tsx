import { Copy, Maximize2 } from "lucide-react";
import { truncateForAttribute } from "@/components/data-grid/table-data-grid/data-cell-preview-format";
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

const TEXT_TITLE_MAX_LENGTH = 1000;
const TEXT_PREVIEW_MAX_LENGTH = 4000;

interface TextPreviewProps {
  columnName: string;
  isTruncated: boolean;
  raw: string;
  rawType: string;
}

function TextPreview({
  columnName,
  isTruncated,
  raw,
  rawType,
}: TextPreviewProps) {
  const { onOpenChange, open, openDialog } = useDataValueDialogState();
  const preview = truncateForAttribute(
    raw.replaceAll(/\s+/g, " "),
    TEXT_PREVIEW_MAX_LENGTH
  );
  const title = truncateForAttribute(raw, TEXT_TITLE_MAX_LENGTH);

  return (
    <span className="flex min-w-0 flex-1 items-center gap-2">
      <span
        className="block min-w-0 flex-1 truncate whitespace-nowrap"
        data-testid={`${columnName}-text-preview`}
        title={title}
      >
        {preview}
      </span>
      <Button
        aria-label={`View full text for ${columnName}`}
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
              <DialogTitle>{columnName} text</DialogTitle>
              <DialogDescription>
                Full {rawType} value. Scroll the preview for long content.
              </DialogDescription>
            </DialogHeader>
            {isTruncated ? (
              <p className="rounded-md border border-amber-500/30 bg-amber-500/10 px-3 py-2 text-amber-700 text-xs dark:text-amber-300">
                This cell preview is truncated. Open the row detail drawer to
                load the full value.
              </p>
            ) : null}
            <pre
              className={cn(
                "min-h-0 flex-1 overflow-auto rounded-md border bg-muted/30 p-3",
                "whitespace-pre-wrap break-words font-mono text-xs"
              )}
            >
              {raw}
            </pre>
            <div className="flex shrink-0 justify-end">
              <Button
                onClick={() => writeClipboard(raw)}
                size="sm"
                type="button"
                variant="outline"
              >
                <Copy className="size-3.5" />
                Copy text
              </Button>
            </div>
          </DialogContent>
        </Dialog>
      ) : null}
    </span>
  );
}

export { TextPreview };
