import { parseTableQualifiedName } from "@/lib/console-resources";
import type {
  Column,
  TableConstraint,
  TableIndex,
} from "@/protogen/querylane/console/v1alpha1/table_pb";
import { ConstraintType } from "@/protogen/querylane/console/v1alpha1/table_pb";

interface ColumnRow {
  column: Column;
  fks: {
    column: string;
    table: string;
  }[];
  isIndexed: boolean;
}

function parseReferencedTable(referencedTable: string): string {
  if (!referencedTable) {
    return "";
  }
  try {
    const { schema, table } = parseTableQualifiedName(referencedTable);
    return `${schema}.${table}`;
  } catch {
    return referencedTable;
  }
}

function foreignKeysByColumn(constraints: TableConstraint[]) {
  const fksByColumn = new Map<
    string,
    {
      column: string;
      table: string;
    }[]
  >();
  for (const constraint of constraints) {
    if (constraint.type !== ConstraintType.FOREIGN_KEY) {
      continue;
    }
    const referencedTable = parseReferencedTable(constraint.referencedTable);
    // Composite foreign keys pair column_names[i] with
    // referenced_column_names[i]; every pair gets its own label.
    for (const [pairIndex, localColumn] of constraint.columnNames.entries()) {
      const referencedColumn = constraint.referencedColumnNames[pairIndex];
      if (
        !(
          localColumn &&
          typeof referencedColumn === "string" &&
          referencedColumn.length > 0
        )
      ) {
        continue;
      }
      const existing = fksByColumn.get(localColumn) ?? [];
      existing.push({ column: referencedColumn, table: referencedTable });
      fksByColumn.set(localColumn, existing);
    }
  }
  return fksByColumn;
}

function deriveColumnRows(
  columns: Column[],
  constraints: TableConstraint[],
  indexes: TableIndex[]
): ColumnRow[] {
  const indexedColumns = new Set<string>();
  for (const index of indexes) {
    for (const columnName of index.keyColumns) {
      indexedColumns.add(columnName);
    }
  }
  const fksByColumn = foreignKeysByColumn(constraints);
  return columns.map((column) => ({
    column,
    fks: fksByColumn.get(column.columnName) ?? [],
    isIndexed: indexedColumns.has(column.columnName),
  }));
}

export type { ColumnRow };
export { deriveColumnRows };
