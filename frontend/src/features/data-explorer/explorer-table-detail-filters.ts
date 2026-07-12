import type { ColumnRow } from "@/features/data-explorer/explorer-column-rows";
import { describePostgresType } from "@/features/data-explorer/postgres-type-display";
import type {
  ConstraintType,
  PolicyMode,
  TableConstraint,
  TablePolicy,
  TableTrigger,
} from "@/protogen/querylane/console/v1alpha1/table_pb";

type ColumnDefaultFilter = "has-default" | "no-default";
type ColumnGenerationFilter = "generated" | "identity" | "regular";
type ColumnKeyFilter = "foreign" | "index" | "none" | "primary" | "unique";
type ColumnNullabilityFilter = "not-null" | "nullable";
type TriggerStateFilter = "disabled" | "enabled";

// Multi-select facets: an empty selection means "no filter". Each facet keeps
// only rows whose value is one of the selected values.
interface ColumnDetailFilters {
  defaultKinds?: ColumnDefaultFilter[] | undefined;
  generationKinds?: ColumnGenerationFilter[] | undefined;
  keyKinds?: ColumnKeyFilter[] | undefined;
  nullability?: ColumnNullabilityFilter[] | undefined;
  typeCategories?: string[] | undefined;
}

function columnDefaultKind(row: ColumnRow): ColumnDefaultFilter {
  return row.column.defaultValue ? "has-default" : "no-default";
}

function columnGenerationKinds(row: ColumnRow): ColumnGenerationFilter[] {
  const kinds: ColumnGenerationFilter[] = [];
  if (row.column.isIdentity) {
    kinds.push("identity");
  }
  if (row.column.isGenerated) {
    kinds.push("generated");
  }
  return kinds.length > 0 ? kinds : ["regular"];
}

function columnTypeCategory(row: ColumnRow): string {
  return describePostgresType(row.column).category;
}

function columnKeyKinds(row: ColumnRow): ColumnKeyFilter[] {
  const kinds: ColumnKeyFilter[] = [];
  if (row.column.isPrimaryKey) {
    kinds.push("primary");
  }
  if (row.fks.length > 0) {
    kinds.push("foreign");
  }
  if (row.column.isUnique) {
    kinds.push("unique");
  }
  if (
    row.isIndexed &&
    !(row.column.isPrimaryKey || row.column.isUnique || row.fks.length > 0)
  ) {
    kinds.push("index");
  }
  return kinds.length > 0 ? kinds : ["none"];
}

function columnNullability(row: ColumnRow): ColumnNullabilityFilter {
  return row.column.isNullable ? "nullable" : "not-null";
}

function matchesSelected<Value>(selected: Value[], rowValues: Value[]) {
  return (
    selected.length === 0 ||
    selected.some((selectedValue) => rowValues.includes(selectedValue))
  );
}

function filterColumnDetailRows(
  rows: ColumnRow[],
  filters: ColumnDetailFilters
): ColumnRow[] {
  const types = filters.typeCategories ?? [];
  const keys = filters.keyKinds ?? [];
  const nullability = filters.nullability ?? [];
  const defaults = filters.defaultKinds ?? [];
  const generations = filters.generationKinds ?? [];
  return rows.filter(
    (row) =>
      matchesSelected(types, [columnTypeCategory(row)]) &&
      matchesSelected(keys, columnKeyKinds(row)) &&
      matchesSelected(nullability, [columnNullability(row)]) &&
      matchesSelected(defaults, [columnDefaultKind(row)]) &&
      matchesSelected(generations, columnGenerationKinds(row))
  );
}

function filterConstraintsByKind(
  constraints: TableConstraint[],
  kinds: ConstraintType[]
): TableConstraint[] {
  if (kinds.length === 0) {
    return constraints;
  }
  return constraints.filter((constraint) => kinds.includes(constraint.type));
}

function filterPoliciesByMode(
  policies: TablePolicy[],
  modes: PolicyMode[]
): TablePolicy[] {
  if (modes.length === 0) {
    return policies;
  }
  return policies.filter((policy) => modes.includes(policy.mode));
}

function filterTableTriggers(
  triggers: TableTrigger[],
  filters: { search: string; states: TriggerStateFilter[] }
): TableTrigger[] {
  const search = filters.search.trim().toLowerCase();
  return triggers.filter((trigger) => {
    if (search && !trigger.triggerName.toLowerCase().includes(search)) {
      return false;
    }
    if (filters.states.length === 0) {
      return true;
    }
    const state = trigger.enabled ? "enabled" : "disabled";
    return filters.states.includes(state);
  });
}

export type {
  ColumnDefaultFilter,
  ColumnDetailFilters,
  ColumnGenerationFilter,
  ColumnKeyFilter,
  ColumnNullabilityFilter,
  TriggerStateFilter,
};
export {
  columnDefaultKind,
  columnGenerationKinds,
  columnKeyKinds,
  columnNullability,
  columnTypeCategory,
  filterColumnDetailRows,
  filterConstraintsByKind,
  filterPoliciesByMode,
  filterTableTriggers,
};
