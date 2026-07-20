import type { TableForeignKeyReference } from "@/components/data-grid/table-data-grid/foreign-key-reference-state";
import { parseTableQualifiedName } from "@/lib/console-resources";
import type {
  TableConstraint,
  TableIndex,
} from "@/protogen/querylane/console/v1alpha1/table_pb";
import { ConstraintType } from "@/protogen/querylane/console/v1alpha1/table_pb";

type TableKeyKind = "foreign" | "primary" | "secondary-index" | "unique";
interface TableKeyRow {
  columnsLabel: string;
  detail: string;
  id: string;
  kind: TableKeyKind;
  kindLabel: string;
  name: string;
  sortRank: number;
}
const TABLE_KEY_KIND_LABELS: Record<TableKeyKind, string> = {
  foreign: "Foreign key",
  primary: "Primary key",
  "secondary-index": "Secondary index",
  unique: "Unique key",
};
const TABLE_KEY_KIND_RANKS: Record<TableKeyKind, number> = {
  foreign: 1,
  primary: 0,
  "secondary-index": 3,
  unique: 2,
};
const TABLE_CONSTRAINT_KEY_KINDS: Record<ConstraintType, TableKeyKind | null> =
  {
    [ConstraintType.UNSPECIFIED]: null,
    [ConstraintType.PRIMARY_KEY]: "primary",
    [ConstraintType.UNIQUE]: "unique",
    [ConstraintType.FOREIGN_KEY]: "foreign",
    [ConstraintType.CHECK]: null,
    [ConstraintType.EXCLUSION]: null,
  };
const BACKING_INDEX_CONSTRAINT_TYPES = new Set<ConstraintType>([
  ConstraintType.PRIMARY_KEY,
  ConstraintType.UNIQUE,
]);
function formatColumnList(columnNames: string[]) {
  return columnNames.length > 0 ? columnNames.join(", ") : "—";
}
function formatIndexColumns(index: TableIndex) {
  const base = `(${index.keyColumns.join(", ")})`;
  if (index.includedColumns.length === 0) {
    return base;
  }
  return `${base} INCLUDE (${index.includedColumns.join(", ")})`;
}
function formatReferencedTable(referencedTable: string) {
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
function formatForeignKeyColumns(constraint: TableConstraint) {
  const targetTable = formatReferencedTable(constraint.referencedTable);
  const targetColumns = constraint.referencedColumnNames.join(", ");
  const target = targetColumns
    ? `${targetTable}(${targetColumns})`
    : targetTable;
  if (!target) {
    return formatColumnList(constraint.columnNames);
  }
  return `${formatColumnList(constraint.columnNames)} → ${target}`;
}
function createConstraintKeyRow(
  constraint: TableConstraint,
  kind: TableKeyKind
): TableKeyRow {
  return {
    columnsLabel:
      kind === "foreign"
        ? formatForeignKeyColumns(constraint)
        : formatColumnList(constraint.columnNames),
    detail: constraint.definition || "—",
    id: `constraint:${constraint.constraintName}`,
    kind,
    kindLabel: TABLE_KEY_KIND_LABELS[kind],
    name: constraint.constraintName || "—",
    sortRank: TABLE_KEY_KIND_RANKS[kind],
  };
}
function deriveConstraintKeyRows(constraints: TableConstraint[]): {
  backingConstraintNames: Set<string>;
  rows: TableKeyRow[];
} {
  const backingConstraintNames = new Set<string>();
  const rows: TableKeyRow[] = [];
  for (const constraint of constraints) {
    const kind = TABLE_CONSTRAINT_KEY_KINDS[constraint.type] ?? null;
    if (!kind) {
      continue;
    }
    if (BACKING_INDEX_CONSTRAINT_TYPES.has(constraint.type)) {
      backingConstraintNames.add(constraint.constraintName);
    }
    rows.push(createConstraintKeyRow(constraint, kind));
  }
  return { backingConstraintNames, rows };
}
function createSecondaryIndexKeyRow(index: TableIndex): TableKeyRow {
  const uniqueLabel = index.isUnique ? "Unique " : "";
  return {
    columnsLabel: formatIndexColumns(index),
    detail: `${uniqueLabel}${index.method || "index"}`.trim(),
    id: `index:${index.indexName}`,
    kind: "secondary-index",
    kindLabel: TABLE_KEY_KIND_LABELS["secondary-index"],
    name: index.indexName || "—",
    sortRank: TABLE_KEY_KIND_RANKS["secondary-index"],
  };
}
function sortTableKeyRows(keyRows: TableKeyRow[]) {
  return keyRows.sort((left, right) => {
    if (left.sortRank !== right.sortRank) {
      return left.sortRank - right.sortRank;
    }
    return left.name.localeCompare(right.name);
  });
}
function deriveTableKeyRows(
  constraints: TableConstraint[],
  indexes: TableIndex[]
): TableKeyRow[] {
  const { backingConstraintNames, rows } = deriveConstraintKeyRows(constraints);
  const secondaryIndexRows: TableKeyRow[] = [];
  for (const index of indexes) {
    if (backingConstraintNames.has(index.indexName)) {
      continue;
    }
    secondaryIndexRows.push(createSecondaryIndexKeyRow(index));
  }
  return sortTableKeyRows([...rows, ...secondaryIndexRows]);
}

function deriveForeignKeyReferences(
  constraints: readonly TableConstraint[] | undefined
): TableForeignKeyReference[] {
  if (!constraints) {
    return [];
  }
  return constraints.flatMap((constraint) => {
    if (
      constraint.type !== ConstraintType.FOREIGN_KEY ||
      !constraint.referencedTable ||
      constraint.columnNames.length === 0 ||
      constraint.columnNames.length !== constraint.referencedColumnNames.length
    ) {
      return [];
    }
    return [
      {
        sourceColumns: constraint.columnNames,
        targetColumns: constraint.referencedColumnNames,
        targetTableName: constraint.referencedTable,
      },
    ];
  });
}

export type { TableKeyKind, TableKeyRow };
export {
  deriveConstraintKeyRows,
  deriveForeignKeyReferences,
  deriveTableKeyRows,
  formatColumnList,
  formatReferencedTable,
  TABLE_KEY_KIND_LABELS,
};
