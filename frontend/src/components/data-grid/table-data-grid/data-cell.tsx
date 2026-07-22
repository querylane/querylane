import { Check, Minus } from "lucide-react";
import { ArrayPreview } from "@/components/data-grid/table-data-grid/data-cell-array-preview";
import { ExpandedJsonPreview } from "@/components/data-grid/table-data-grid/data-cell-expanded-json-preview";
import { JsonPreview } from "@/components/data-grid/table-data-grid/data-cell-json-preview";
import { TEXT_PREVIEW_EXPAND_MIN_LENGTH } from "@/components/data-grid/table-data-grid/data-cell-preview-format";
import { TextPreview } from "@/components/data-grid/table-data-grid/data-cell-text-preview";
import {
  type FormattedCell,
  formatTableCell,
} from "@/features/data-explorer/table-data/table-value-format";
import type {
  TableCell,
  TableResultColumn,
} from "@/protogen/querylane/console/v1alpha1/table_data_pb";

interface DataCellProps {
  cell: TableCell | undefined;
  column: TableResultColumn;
  jsonDisplay?: "compact" | "expanded" | undefined;
}

function renderCell(
  cell: FormattedCell,
  column: TableResultColumn,
  jsonDisplay: "compact" | "expanded"
) {
  if (cell.isNull) {
    return (
      <span className="text-muted-foreground/60 italic">{cell.display}</span>
    );
  }
  switch (cell.kind) {
    case "array":
      return (
        <ArrayPreview
          columnName={column.columnName}
          isTruncated={cell.isTruncated}
          raw={cell.display}
          rawType={column.rawType}
        />
      );
    case "bool":
      return cell.display === "true" ? (
        <span className="inline-flex items-center gap-1.5 font-mono">
          <Check
            aria-label="true"
            className="size-3 text-emerald-500 dark:text-emerald-400"
          />
          <span>true</span>
        </span>
      ) : (
        <span className="inline-flex items-center gap-1.5 font-mono text-muted-foreground">
          <Minus aria-label="false" className="size-3" />
          <span>false</span>
        </span>
      );
    case "number":
      return <span className="font-mono tabular-nums">{cell.display}</span>;
    case "json":
      if (jsonDisplay === "expanded") {
        return <ExpandedJsonPreview raw={cell.display} />;
      }
      return (
        <JsonPreview
          columnName={column.columnName}
          isTruncated={cell.isTruncated}
          raw={cell.display}
          rawType={column.rawType}
        />
      );
    case "bytes":
      return (
        <span className="truncate text-muted-foreground">{cell.display}</span>
      );
    case "timestamp":
    case "date":
      return (
        <span className="inline-flex min-w-0 items-center gap-1.5">
          <span className="font-mono text-xs tabular-nums" title={cell.display}>
            {cell.display}
          </span>
        </span>
      );
    default:
      if (
        cell.isTruncated ||
        cell.display.length >= TEXT_PREVIEW_EXPAND_MIN_LENGTH
      ) {
        return (
          <TextPreview
            columnName={column.columnName}
            isTruncated={cell.isTruncated}
            raw={cell.display}
            rawType={column.rawType}
          />
        );
      }
      return (
        <span className="block w-full truncate" title={cell.display}>
          {cell.display}
        </span>
      );
  }
}

export function DataCell({
  cell,
  column,
  jsonDisplay = "compact",
}: DataCellProps) {
  const formatted = formatTableCell(cell, column);
  return renderCell(formatted, column, jsonDisplay);
}
