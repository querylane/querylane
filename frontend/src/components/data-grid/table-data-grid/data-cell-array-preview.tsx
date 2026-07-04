import { Copy, Maximize2 } from "lucide-react";
import {
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
import {
  keyPostgresArrayItems,
  parsePostgresArrayLiteral,
} from "@/features/data-explorer/table-data/postgres-array";
import { cn } from "@/lib/utils";

const ARRAY_PREVIEW_ITEM_LIMIT = 3;

interface ArrayPreviewProps {
  columnName: string;
  isTruncated: boolean;
  raw: string;
  rawType: string;
}

function ArrayPreview({
  columnName,
  isTruncated,
  raw,
  rawType,
}: ArrayPreviewProps) {
  const { onOpenChange, open, openDialog } = useDataValueDialogState();
  const parsed = parsePostgresArrayLiteral(raw);
  const itemCount = parsed.ok ? parsed.items.length : undefined;
  const summary =
    itemCount === undefined
      ? "Array"
      : `${itemCount.toLocaleString()} ${itemCount === 1 ? "item" : "items"}`;
  const keyedItems = parsed.ok ? keyPostgresArrayItems(parsed.items) : [];
  const firstItems = keyedItems.slice(0, ARRAY_PREVIEW_ITEM_LIMIT);
  const title = truncateForAttribute(raw, JSON_TITLE_MAX_LENGTH);

  return (
    <span className="flex min-w-0 flex-1 items-center gap-2">
      <span
        className="flex min-w-0 flex-1 items-center gap-1.5"
        data-testid={`${columnName}-array-preview`}
        title={title}
      >
        <span className="shrink-0 rounded-full border border-sky-500/25 bg-sky-500/10 px-1.5 py-0.5 font-medium text-[10px] text-sky-700 leading-none dark:text-sky-300">
          {summary}
        </span>
        {firstItems.map(({ item, key }) => (
          <code
            className={cn(
              "max-w-24 truncate rounded border bg-muted/40 px-1.5 py-0.5 font-mono text-[10px]",
              item.isNull
                ? "text-muted-foreground italic"
                : "text-foreground/80"
            )}
            key={key}
          >
            {item.isNull ? "NULL" : item.display}
          </code>
        ))}
      </span>
      <Button
        aria-label={`View full array for ${columnName}`}
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
          <DialogContent className="!flex !max-w-[calc(100vw-2rem)] max-h-[calc(100dvh-2rem)] w-[min(56rem,calc(100vw-2rem))] flex-col gap-4 overflow-hidden">
            <DialogHeader className="shrink-0 pr-10">
              <DialogTitle>{columnName} array</DialogTitle>
              <DialogDescription>
                Formatted {rawType} value with indexed elements.
              </DialogDescription>
            </DialogHeader>
            {isTruncated ? (
              <p className="rounded-md border border-amber-500/30 bg-amber-500/10 px-3 py-2 text-amber-700 text-xs dark:text-amber-300">
                This cell preview is truncated. Open the row detail drawer to
                load the full value.
              </p>
            ) : null}
            {parsed.ok ? (
              <div className="min-h-0 flex-1 overflow-auto rounded-md border bg-muted/20">
                {parsed.items.length === 0 ? (
                  <div className="p-4 text-muted-foreground text-sm">
                    Empty array
                  </div>
                ) : (
                  <ol className="divide-y">
                    {keyedItems.map(({ item, key, position }) => (
                      <li
                        className="grid grid-cols-[4rem_minmax(0,1fr)] gap-3 px-3 py-2 text-sm"
                        key={key}
                      >
                        <span className="font-mono text-muted-foreground text-xs tabular-nums">
                          {position}
                        </span>
                        {item.isNull ? (
                          <span className="text-muted-foreground italic">
                            SQL NULL
                          </span>
                        ) : (
                          <code className="break-all font-mono text-xs">
                            {item.display}
                          </code>
                        )}
                      </li>
                    ))}
                  </ol>
                )}
              </div>
            ) : (
              <pre className="min-h-0 flex-1 overflow-auto whitespace-pre-wrap break-all rounded-md border bg-muted/30 p-3 font-mono text-xs">
                {raw}
              </pre>
            )}
            <div className="flex shrink-0 justify-end">
              <Button
                onClick={() => writeClipboard(raw)}
                size="sm"
                type="button"
                variant="outline"
              >
                <Copy className="size-3.5" />
                Copy array
              </Button>
            </div>
          </DialogContent>
        </Dialog>
      ) : null}
    </span>
  );
}

export { ArrayPreview };
