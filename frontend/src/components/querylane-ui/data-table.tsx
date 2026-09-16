import type { RowData } from "@tanstack/react-table";
import {
  DataTable as BaseDataTable,
  type DataTableProps,
} from "@/components/ui/data-table";

function DataTable<Row extends RowData>({
  density,
  ...props
}: Omit<DataTableProps<Row>, "tableClassName"> & { density?: "metadata" }) {
  return (
    <BaseDataTable<Row>
      {...props}
      tableClassName={density === "metadata" ? "text-sm" : undefined}
    />
  );
}

export { DataTable };
