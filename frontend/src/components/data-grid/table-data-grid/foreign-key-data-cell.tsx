import { DataCell } from "@/components/data-grid/table-data-grid/data-cell";
import { Button } from "@/components/ui/button";
import { formatTableCell } from "@/features/data-explorer/table-data/table-value-format";
import { cn } from "@/lib/utils";
import type {
  TableCell,
  TableResultColumn,
} from "@/protogen/querylane/console/v1alpha1/table_data_pb";

function ForeignKeyDataCell({
  cell,
  column,
  onOpen,
}: {
  cell: TableCell | undefined;
  column: TableResultColumn;
  onOpen: () => void;
}) {
  const formatted = formatTableCell(cell, column);
  if (formatted.isNull || formatted.display === "") {
    return <DataCell cell={cell} column={column} />;
  }

  return (
    <Button
      aria-label={`Open ${column.columnName} reference ${formatted.display}`}
      className={cn(
        "h-auto max-w-full justify-start px-0 py-0 font-mono text-xs",
        "text-sky-600 underline decoration-dotted underline-offset-4 hover:text-sky-700",
        "dark:text-sky-400 dark:hover:text-sky-300"
      )}
      onClick={(event) => {
        event.stopPropagation();
        onOpen();
      }}
      size="xs"
      title={`Open referenced row for ${column.columnName}`}
      type="button"
      variant="link"
    >
      <span className="truncate">{formatted.display}</span>
    </Button>
  );
}

export { ForeignKeyDataCell };
