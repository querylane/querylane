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

type ParsedArray = ReturnType<typeof parsePostgresArrayLiteral>;
type KeyedArrayItem = ReturnType<typeof keyPostgresArrayItems>[number];

function ArrayItemRow({ entry }: { entry: KeyedArrayItem }) {
  return (
    <li className="grid grid-cols-[4rem_minmax(0,1fr)] gap-3 px-3 py-2 text-sm">
      <span className="font-mono text-muted-foreground text-xs tabular-nums">
        {entry.position}
      </span>
      {entry.item.isNull ? (
        <span className="text-muted-foreground italic">SQL NULL</span>
      ) : (
        <code className="break-all font-mono text-xs">
          {entry.item.display}
        </code>
      )}
    </li>
  );
}

function ArrayItemsContent({
  keyedItems,
  parsed,
  raw,
}: {
  keyedItems: KeyedArrayItem[];
  parsed: ParsedArray;
  raw: string;
}) {
  if (!parsed.ok) {
    return (
      <pre className="min-h-0 flex-1 overflow-auto whitespace-pre-wrap break-all rounded-md border bg-muted/30 p-3 font-mono text-xs">
        {raw}
      </pre>
    );
  }
  if (parsed.items.length === 0) {
    return (
      <div className="min-h-0 flex-1 overflow-auto rounded-md border bg-muted/20">
        <div className="p-4 text-muted-foreground text-sm">Empty array</div>
      </div>
    );
  }
  return (
    <div className="min-h-0 flex-1 overflow-auto rounded-md border bg-muted/20">
      <ol className="divide-y">
        {keyedItems.map((entry) => (
          <ArrayItemRow entry={entry} key={entry.key} />
        ))}
      </ol>
    </div>
  );
}

function ArrayPreviewDialog({
  columnName,
  isTruncated,
  keyedItems,
  onOpenChange,
  open,
  parsed,
  raw,
  rawType,
}: ArrayPreviewProps & {
  keyedItems: KeyedArrayItem[];
  onOpenChange: (open: boolean) => void;
  open: boolean;
  parsed: ParsedArray;
}) {
  if (!open) {
    return null;
  }
  return (
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
            This cell preview is truncated. Open the row detail drawer to load
            the full value.
          </p>
        ) : null}
        <ArrayItemsContent keyedItems={keyedItems} parsed={parsed} raw={raw} />
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
  );
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
      <ArrayPreviewDialog
        columnName={columnName}
        isTruncated={isTruncated}
        keyedItems={keyedItems}
        onOpenChange={onOpenChange}
        open={open}
        parsed={parsed}
        raw={raw}
        rawType={rawType}
      />
    </span>
  );
}

export { ArrayPreview };
