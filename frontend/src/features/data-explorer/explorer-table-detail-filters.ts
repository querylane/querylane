import type { ColumnRow } from "@/features/data-explorer/explorer-column-rows";
import { normalizeIndexMethod } from "@/features/data-explorer/postgres-index-method-display";
import { describePostgresType } from "@/features/data-explorer/postgres-type-display";
import type {
  ConstraintType,
  PolicyMode,
  TableConstraint,
  TableIndex,
  TablePolicy,
  TableTrigger,
} from "@/protogen/querylane/console/v1alpha1/table_pb";

type ColumnKeyFilter = "foreign" | "indexed" | "none" | "primary";
type TriggerStateFilter = "disabled" | "enabled";

// Multi-select facets: an empty selection means "no filter". Each facet keeps
// only rows whose value is one of the selected values.
interface ColumnDetailFilters {
  keyKinds?: ColumnKeyFilter[] | undefined;
  typeCategories?: string[] | undefined;
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
  if (row.isIndexed && !row.column.isPrimaryKey) {
    kinds.push("indexed");
  }
  return kinds.length > 0 ? kinds : ["none"];
}

function filterColumnDetailRows(
  rows: ColumnRow[],
  filters: ColumnDetailFilters
): ColumnRow[] {
  const types = filters.typeCategories ?? [];
  const keys = filters.keyKinds ?? [];
  return rows.filter((row) => {
    if (types.length > 0 && !types.includes(columnTypeCategory(row))) {
      return false;
    }
    if (keys.length > 0) {
      const rowKinds = columnKeyKinds(row);
      if (!keys.some((kind) => rowKinds.includes(kind))) {
        return false;
      }
    }
    return true;
  });
}

function filterIndexesByMethod(
  indexes: TableIndex[],
  methods: string[]
): TableIndex[] {
  if (methods.length === 0) {
    return indexes;
  }
  return indexes.filter((index) =>
    methods.includes(normalizeIndexMethod(index.method))
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

function filterTriggersByState(
  triggers: TableTrigger[],
  states: TriggerStateFilter[]
): TableTrigger[] {
  if (states.length === 0) {
    return triggers;
  }
  return triggers.filter((trigger) =>
    trigger.enabled ? states.includes("enabled") : states.includes("disabled")
  );
}

export type { ColumnDetailFilters, ColumnKeyFilter, TriggerStateFilter };
export {
  columnKeyKinds,
  columnTypeCategory,
  filterColumnDetailRows,
  filterConstraintsByKind,
  filterIndexesByMethod,
  filterPoliciesByMode,
  filterTriggersByState,
};
