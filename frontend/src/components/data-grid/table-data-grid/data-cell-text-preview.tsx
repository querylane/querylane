import { Maximize2 } from "lucide-react";
import { truncateForAttribute } from "@/components/data-grid/table-data-grid/data-cell-preview-format";
import { useDataValueDialogState } from "@/components/data-grid/table-data-grid/use-data-value-dialog-state";
import { Button } from "@/components/querylane-ui/button";
import { DataValuePreviewDialog } from "./data-value-preview-dialog";

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
        className="h-5 shrink-0"
        onClick={(event) => {
          event.stopPropagation();
          openDialog();
        }}
        onMouseDown={(event) => event.stopPropagation()}
        presentation="preview-toolbar"
        size="xs"
        type="button"
        variant="ghost"
      >
        <Maximize2 className="size-3" />
      </Button>
      {open ? (
        <DataValuePreviewDialog
          columnName={columnName}
          format="text"
          isTruncated={isTruncated}
          onOpenChange={onOpenChange}
          raw={raw}
          rawType={rawType}
        >
          {raw}
        </DataValuePreviewDialog>
      ) : null}
    </span>
  );
}

export { TextPreview };
