import {
  ConstraintType,
  type TableConstraint,
  type TableIndex,
} from "@/protogen/querylane/console/v1alpha1/table_pb";

export function buildTruncatedTextPreview(value: string, maxLength = 120) {
  if (value.trim().length === 0) {
    return {
      displayValue: "—",
      forceTooltip: false,
      tooltipContent: undefined,
    };
  }

  if (value.length <= maxLength) {
    return {
      displayValue: value,
      forceTooltip: false,
      tooltipContent: undefined,
    };
  }

  return {
    displayValue: `${value.slice(0, maxLength).trimEnd()}…`,
    forceTooltip: true,
    tooltipContent: value,
  };
}

export function buildColumnDecorators({
  constraints,
  indexes,
}: {
  constraints: TableConstraint[];
  indexes: TableIndex[];
}) {
  const foreignKeyColumns = new Set<string>();
  const indexedColumns = new Set<string>();

  for (const constraint of constraints) {
    if (constraint.type === ConstraintType.FOREIGN_KEY) {
      for (const columnName of constraint.columnNames) {
        foreignKeyColumns.add(columnName);
      }
    }
  }

  for (const index of indexes) {
    for (const columnName of [...index.keyColumns, ...index.includedColumns]) {
      indexedColumns.add(columnName);
    }
  }

  return {
    foreignKeyColumns,
    indexedColumns,
  };
}
