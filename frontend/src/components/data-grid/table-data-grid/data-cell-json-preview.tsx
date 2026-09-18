import { Maximize2 } from "lucide-react";
import {
  formatJsonPreview,
  formatPrettyJson,
  JSON_TITLE_MAX_LENGTH,
  truncateForAttribute,
} from "@/components/data-grid/table-data-grid/data-cell-preview-format";
import { useDataValueDialogState } from "@/components/data-grid/table-data-grid/use-data-value-dialog-state";
import { Button } from "@/components/querylane-ui/button";
import { DataValuePreviewDialog } from "./data-value-preview-dialog";

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
        className="block min-w-0 flex-1 truncate whitespace-nowrap font-mono text-permission-600 text-xs dark:text-permission-400"
        data-testid={`${columnName}-json-preview`}
        title={title}
      >
        {preview}
      </code>
      <Button
        aria-label={`View full JSON for ${columnName}`}
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
          format="JSON"
          isTruncated={isTruncated}
          onOpenChange={onOpenChange}
          raw={raw}
          rawType={rawType}
        >
          {pretty}
        </DataValuePreviewDialog>
      ) : null}
    </span>
  );
}

export { JsonPreview };
