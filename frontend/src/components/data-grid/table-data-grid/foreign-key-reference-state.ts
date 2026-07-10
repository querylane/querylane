import { getGridCell } from "@/components/data-grid/table-data-grid/grid-cell-access";
import type { GridRow } from "@/components/data-grid/table-data-grid/grid-row-model";
import {
  serializeTableFilterSearch,
  type TableFilterRule,
} from "@/features/data-explorer/table-data/filter-state";
import { formatTableCell } from "@/features/data-explorer/table-data/table-value-format";
import { parseTableQualifiedName } from "@/lib/console-resources";
import type {
  TableCell,
  TableResultColumn,
} from "@/protogen/querylane/console/v1alpha1/table_data_pb";

interface TableForeignKeyReference {
  constraintName: string;
  sourceColumns: string[];
  targetColumns: string[];
  targetTableName: string;
}

interface ForeignKeyReferencePreview {
  displayValue: string;
  filterSearch: string;
  isComposite: boolean;
  reference: TableForeignKeyReference;
  sourceColumn: string;
  targetLabel: string;
}

function tableCellValueToFilterLiteral(cell: TableCell | undefined) {
  if (cell?.truncated === true) {
    return;
  }
  const value = cell?.value?.kind;
  if (!value || value.case === "nullValue") {
    return;
  }
  switch (value.case) {
    case "bytesValue":
      return;
    case "boolValue":
      return value.value ? "true" : "false";
    case "doubleValue":
      // Non-finite doubles have no parseable filter literal, and the drawer
      // grid would drop the resulting predicate as invalid.
      if (!Number.isFinite(value.value)) {
        return;
      }
      return String(value.value);
    case "int64Value":
    case "jsonValue":
    case "numericValue":
    case "stringValue":
    case "timestampValue": {
      const literal = String(value.value);
      // Values that trim to empty are treated as "incomplete" filter rules by
      // the drawer grid and silently excluded from the row filter, which would
      // leave the drawer showing the whole referenced table.
      return literal.trim() === "" ? undefined : literal;
    }
    default:
      return;
  }
}

function formatForeignKeyTargetLabel(targetTableName: string) {
  try {
    const { schema, table } = parseTableQualifiedName(targetTableName);
    return `${schema}.${table}`;
  } catch {
    return targetTableName;
  }
}

function foreignKeyReferencesForColumn(
  references: readonly TableForeignKeyReference[],
  columnName: string
) {
  return references.filter((reference) =>
    reference.sourceColumns.includes(columnName)
  );
}

function buildForeignKeyFilterSearch({
  reference,
  resultColumns,
  row,
}: {
  reference: TableForeignKeyReference;
  resultColumns: readonly TableResultColumn[];
  row: GridRow;
}) {
  const rules: TableFilterRule[] = [];

  reference.sourceColumns.forEach((sourceColumn, index) => {
    const targetColumn = reference.targetColumns[index];
    const resultColumn = resultColumns.find(
      (column) => column.columnName === sourceColumn
    );
    if (!(resultColumn && targetColumn)) {
      return;
    }

    const literal = tableCellValueToFilterLiteral(
      getGridCell(row, resultColumn)
    );
    if (!literal) {
      return;
    }

    rules.push({
      column: targetColumn,
      id: `${reference.constraintName || "fk"}:${targetColumn}:${index}`,
      operator: "eq",
      value: literal,
    });
  });

  if (rules.length !== reference.sourceColumns.length || rules.length === 0) {
    return;
  }

  return serializeTableFilterSearch({ logic: "and", rules });
}

function buildForeignKeyReferencePreview({
  reference,
  resultColumns,
  row,
  sourceColumn,
}: {
  reference: TableForeignKeyReference;
  resultColumns: readonly TableResultColumn[];
  row: GridRow;
  sourceColumn: string;
}): ForeignKeyReferencePreview | undefined {
  const resultColumn = resultColumns.find(
    (column) => column.columnName === sourceColumn
  );
  if (!resultColumn) {
    return;
  }
  const cell = getGridCell(row, resultColumn);
  const formatted = formatTableCell(cell, resultColumn);
  if (formatted.isNull || formatted.isTruncated || formatted.display === "") {
    return;
  }

  const filterSearch = buildForeignKeyFilterSearch({
    reference,
    resultColumns,
    row,
  });
  if (!filterSearch) {
    return;
  }

  return {
    displayValue: formatted.display,
    filterSearch,
    isComposite: reference.sourceColumns.length > 1,
    reference,
    sourceColumn,
    targetLabel: formatForeignKeyTargetLabel(reference.targetTableName),
  };
}

export type { ForeignKeyReferencePreview, TableForeignKeyReference };
export { buildForeignKeyReferencePreview, foreignKeyReferencesForColumn };
