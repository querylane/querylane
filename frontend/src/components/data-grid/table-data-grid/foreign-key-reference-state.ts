import { create } from "@bufbuild/protobuf";
import type { ReactNode } from "react";
import { getGridCell } from "@/components/data-grid/table-data-grid/grid-cell-access";
import type { GridRow } from "@/components/data-grid/table-data-grid/grid-row-model";
import { formatTableCell } from "@/features/data-explorer/table-data/table-value-format";
import { tryParseTableQualifiedName } from "@/lib/console-resources";
import {
  type RowFilter,
  RowFilterGroup_Logic,
  RowFilterGroupSchema,
  RowFilterSchema,
  RowPredicate_Operator,
  RowPredicateSchema,
  type TableCell,
  type TableResultColumn,
  type TableValue,
} from "@/protogen/querylane/console/v1alpha1/table_data_pb";

interface TableForeignKeyReference {
  sourceColumns: string[];
  targetColumns: string[];
  targetTableName: string;
}

type RenderOpenReferencedTableLink = (
  tableName: string,
  onNavigate: () => void
) => ReactNode;

interface ForeignKeyReferencePreview {
  displayValue: string;
  isComposite: boolean;
  reference: TableForeignKeyReference;
  requiredFilter: RowFilter;
  sourceColumn: string;
  targetLabel: string;
}

function ignoreUnknownTableValueKind(value: never): void {
  Boolean(value);
}

function tableCellValueToFilterValue(
  cell: TableCell | undefined
): TableValue | undefined {
  if (cell?.truncated === true) {
    return;
  }
  const value = cell?.value?.kind;
  if (!value) {
    return;
  }
  let filterValue: TableValue | undefined;
  switch (value.case) {
    case undefined:
    case "nullValue":
      break;
    case "bytesValue":
    case "doubleValue":
      if (value.case !== "doubleValue" || Number.isFinite(value.value)) {
        filterValue = cell.value;
      }
      break;
    case "boolValue":
    case "int64Value":
    case "jsonValue":
    case "numericValue":
    case "stringValue":
    case "timestampValue":
      filterValue = cell.value;
      break;
    default:
      ignoreUnknownTableValueKind(value);
  }
  return filterValue;
}

function foreignKeyReferencesForColumn(
  references: readonly TableForeignKeyReference[],
  columnName: string
) {
  return references.filter((reference) =>
    reference.sourceColumns.includes(columnName)
  );
}

function buildForeignKeyRequiredFilter({
  reference,
  resultColumns,
  row,
}: {
  reference: TableForeignKeyReference;
  resultColumns: readonly TableResultColumn[];
  row: GridRow;
}) {
  const children: RowFilter[] = [];

  reference.sourceColumns.forEach((sourceColumn, index) => {
    const targetColumn = reference.targetColumns[index];
    const resultColumn = resultColumns.find(
      (column) => column.columnName === sourceColumn
    );
    if (!(resultColumn && targetColumn)) {
      return;
    }

    const filterValue = tableCellValueToFilterValue(
      getGridCell(row, resultColumn)
    );
    if (!filterValue) {
      return;
    }

    children.push(
      create(RowFilterSchema, {
        node: {
          case: "predicate",
          value: create(RowPredicateSchema, {
            column: targetColumn,
            operator: RowPredicate_Operator.EQUAL,
            values: [filterValue],
          }),
        },
      })
    );
  });

  if (
    children.length !== reference.sourceColumns.length ||
    children.length === 0
  ) {
    return;
  }

  return create(RowFilterSchema, {
    node: {
      case: "group",
      value: create(RowFilterGroupSchema, {
        children,
        logic: RowFilterGroup_Logic.AND,
      }),
    },
  });
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
  const target = tryParseTableQualifiedName(reference.targetTableName);
  if (!target) {
    return;
  }
  const cell = getGridCell(row, resultColumn);
  const formatted = formatTableCell(cell, resultColumn);
  if (
    formatted.isNull ||
    formatted.isTruncated ||
    formatted.display.trim() === ""
  ) {
    return;
  }

  const requiredFilter = buildForeignKeyRequiredFilter({
    reference,
    resultColumns,
    row,
  });
  if (!requiredFilter) {
    return;
  }

  return {
    displayValue: formatted.display,
    isComposite: reference.sourceColumns.length > 1,
    reference,
    requiredFilter,
    sourceColumn,
    targetLabel: `${target.schema}.${target.table}`,
  };
}

export type {
  ForeignKeyReferencePreview,
  RenderOpenReferencedTableLink,
  TableForeignKeyReference,
};
export { buildForeignKeyReferencePreview, foreignKeyReferencesForColumn };
