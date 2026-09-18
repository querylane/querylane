import { Maximize2 } from "lucide-react";
import { truncateForAttribute } from "@/components/data-grid/table-data-grid/data-cell-preview-format";
import { DataValueDialog } from "@/components/data-grid/table-data-grid/data-value-dialog";
import { useDataValueDialogState } from "@/components/data-grid/table-data-grid/use-data-value-dialog-state";
import { Button } from "@/components/ui/button";
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
        <DataValueDialog
          copyLabel="Copy text"
          description={`Full ${rawType} value. Scroll the preview for long content.`}
          isTruncated={isTruncated}
          onOpenChange={onOpenChange}
          open={open}
          raw={raw}
          title={`${columnName} text`}
        >
          <pre
            className={cn(
              "min-h-0 flex-1 overflow-auto rounded-md border bg-muted/30 p-3",
              "whitespace-pre-wrap break-words font-mono text-xs"
            )}
          >
            {raw}
          </pre>
        </DataValueDialog>
      ) : null}
    </span>
  );
}

export { TextPreview };
