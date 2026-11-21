import type { RowData } from "@tanstack/react-table";
import { DataTable as BaseDataTable } from "@/components/ui/data-table";
import type { DataTableProps } from "@/components/ui/data-table-model";

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
