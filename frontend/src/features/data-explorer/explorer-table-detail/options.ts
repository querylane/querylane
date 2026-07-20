import {
  Columns3,
  FileCode2,
  GitBranch,
  KeyRound,
  ListTree,
  type LucideIcon,
  Network,
  RadioTower,
  Rows3,
  ShieldCheck,
} from "lucide-react";
import type { FacetedFilterOption } from "@/components/ui/data-table-faceted-filter";
import type {
  ColumnDefaultFilter,
  ColumnGenerationFilter,
  ColumnKeyFilter,
  ColumnNullabilityFilter,
  TriggerStateFilter,
} from "@/features/data-explorer/explorer-table-detail-filters";
import {
  describePostgresIndexMethod,
  normalizeIndexMethod,
} from "@/features/data-explorer/postgres-index-method-display";
import type { TableDetailTab } from "@/features/data-explorer/table-detail-tab";
import { formatPolicyMode } from "@/lib/protobuf-enums";
import type {
  TableConstraint,
  TableIndex,
  TablePolicy,
  TableTrigger,
} from "@/protogen/querylane/console/v1alpha1/table_pb";
import {
  ConstraintType,
  IdentityGeneration,
  Table_TableType,
} from "@/protogen/querylane/console/v1alpha1/table_pb";

type PillTone = "amber" | "blue" | "emerald" | "slate" | "violet";
const PILL_TONE_CLASSES: Record<PillTone, string> = {
  amber: "bg-amber-500/15 text-amber-700 dark:text-amber-400",
  blue: "bg-blue-500/15 text-blue-700 dark:text-blue-400",
  emerald: "bg-emerald-500/15 text-emerald-700 dark:text-emerald-400",
  slate: "bg-muted text-muted-foreground",
  violet: "bg-violet-500/15 text-violet-700 dark:text-violet-400",
};
const TABLE_TYPE_LABELS: Record<Table_TableType, string> = {
  [Table_TableType.UNSPECIFIED]: "",
  [Table_TableType.BASE_TABLE]: "base table",
  [Table_TableType.TEMPORARY]: "temporary",
  [Table_TableType.EXTERNAL]: "foreign",
  [Table_TableType.PARTITIONED]: "partitioned",
};
const IDENTITY_GENERATION_LABELS = {
  [IdentityGeneration.ALWAYS]: "ALWAYS",
  [IdentityGeneration.BY_DEFAULT]: "BY DEFAULT",
  [IdentityGeneration.UNSPECIFIED]: "",
} satisfies Record<IdentityGeneration, string>;
interface TableDetailTabDefinition {
  // Icons no longer render in the compact tab triggers, but the per-tab empty
  // states still use them.
  icon: LucideIcon;
  label: string;
  value: TableDetailTab;
}
const TABLE_DETAIL_TAB_DEFINITIONS: Record<
  TableDetailTab,
  Omit<TableDetailTabDefinition, "value">
> = {
  columns: { icon: Columns3, label: "Columns" },
  constraints: { icon: GitBranch, label: "Constraints" },
  data: { icon: Rows3, label: "Data" },
  definition: { icon: FileCode2, label: "Definition" },
  indexes: { icon: ListTree, label: "Indexes" },
  keys: { icon: KeyRound, label: "Keys" },
  partitions: { icon: Network, label: "Partitions" },
  policies: { icon: ShieldCheck, label: "Policies" },
  triggers: { icon: RadioTower, label: "Triggers" },
};
const TABLE_DETAIL_TABS: TableDetailTabDefinition[] = [
  { value: "data", ...TABLE_DETAIL_TAB_DEFINITIONS.data },
  { value: "columns", ...TABLE_DETAIL_TAB_DEFINITIONS.columns },
  { value: "keys", ...TABLE_DETAIL_TAB_DEFINITIONS.keys },
  { value: "partitions", ...TABLE_DETAIL_TAB_DEFINITIONS.partitions },
  { value: "indexes", ...TABLE_DETAIL_TAB_DEFINITIONS.indexes },
  { value: "constraints", ...TABLE_DETAIL_TAB_DEFINITIONS.constraints },
  { value: "policies", ...TABLE_DETAIL_TAB_DEFINITIONS.policies },
  { value: "triggers", ...TABLE_DETAIL_TAB_DEFINITIONS.triggers },
  { value: "definition", ...TABLE_DETAIL_TAB_DEFINITIONS.definition },
];
const CONSTRAINT_TYPE_LABELS: Record<ConstraintType, string> = {
  [ConstraintType.UNSPECIFIED]: "—",
  [ConstraintType.PRIMARY_KEY]: "PRIMARY KEY",
  [ConstraintType.UNIQUE]: "UNIQUE",
  [ConstraintType.FOREIGN_KEY]: "FOREIGN KEY",
  [ConstraintType.CHECK]: "CHECK",
  [ConstraintType.EXCLUSION]: "EXCLUSION",
};
interface FacetFilterDefinition {
  handleSelectedValuesChange: (values: string[]) => void;
  label: string;
  options: FacetedFilterOption[];
  selectedValues: string[];
}
type ColumnFacetOption<Value extends string> = FacetedFilterOption & {
  value: Value;
};
const COLUMN_DEFAULT_FILTER_OPTIONS = [
  { label: "Has default", value: "has-default" },
  { label: "No default", value: "no-default" },
] satisfies ColumnFacetOption<ColumnDefaultFilter>[];
const COLUMN_GENERATION_FILTER_OPTIONS = [
  { label: "Identity", value: "identity" },
  { label: "Generated", value: "generated" },
  { label: "Regular", value: "regular" },
] satisfies ColumnFacetOption<ColumnGenerationFilter>[];
const COLUMN_KEY_FILTER_OPTIONS = [
  { label: "Primary key", value: "primary" },
  { label: "Foreign key", value: "foreign" },
  { label: "Unique", value: "unique" },
  { label: "Index", value: "index" },
  { label: "No key", value: "none" },
] satisfies ColumnFacetOption<ColumnKeyFilter>[];
const COLUMN_NULLABILITY_FILTER_OPTIONS = [
  { label: "Not null", value: "not-null" },
  { label: "Nullable", value: "nullable" },
] satisfies ColumnFacetOption<ColumnNullabilityFilter>[];
const TRIGGER_STATE_FILTER_LABELS: Record<TriggerStateFilter, string> = {
  disabled: "Disabled",
  enabled: "Enabled",
};
function uniqueSortedOptions(values: string[]): FacetedFilterOption[] {
  return Array.from(new Set(values.filter(Boolean)))
    .sort((left, right) => left.localeCompare(right))
    .map((value) => ({ label: value, value }));
}
function presentColumnOptions<Value extends string>(
  values: Value[],
  options: readonly ColumnFacetOption<Value>[]
): FacetedFilterOption[] {
  const present = new Set(values);
  return options.filter((option) => present.has(option.value));
}
function presentConstraintKindOptions(
  constraints: TableConstraint[]
): FacetedFilterOption[] {
  return Array.from(new Set(constraints.map((constraint) => constraint.type)))
    .sort((left, right) =>
      CONSTRAINT_TYPE_LABELS[left].localeCompare(CONSTRAINT_TYPE_LABELS[right])
    )
    .map((type) => ({
      label: CONSTRAINT_TYPE_LABELS[type],
      value: String(type),
    }));
}
function presentIndexMethodOptions(
  indexes: TableIndex[]
): FacetedFilterOption[] {
  const options = new Map<string, string>();
  for (const index of indexes) {
    const value = normalizeIndexMethod(index.method);
    options.set(value, describePostgresIndexMethod(index.method).label);
  }
  return Array.from(options.entries())
    .sort((left, right) => left[1].localeCompare(right[1]))
    .map(([value, label]) => ({ label, value }));
}
function presentPolicyModeOptions(
  policies: TablePolicy[]
): FacetedFilterOption[] {
  return Array.from(new Set(policies.map((policy) => policy.mode)))
    .sort((left, right) =>
      formatPolicyMode(left).localeCompare(formatPolicyMode(right))
    )
    .map((mode) => ({ label: formatPolicyMode(mode), value: String(mode) }));
}
function presentTriggerStateOptions(
  triggers: TableTrigger[]
): FacetedFilterOption[] {
  const present = new Set<TriggerStateFilter>(
    triggers.map((trigger) => (trigger.enabled ? "enabled" : "disabled"))
  );
  const options: FacetedFilterOption[] = [];
  for (const value of ["enabled", "disabled"] satisfies TriggerStateFilter[]) {
    if (present.has(value)) {
      options.push({ label: TRIGGER_STATE_FILTER_LABELS[value], value });
    }
  }
  return options;
}
function isTriggerStateFilter(value: string): value is TriggerStateFilter {
  return value === "disabled" || value === "enabled";
}

// Table-detail metadata RPCs currently expose parent-scoped lists only.
// These facets intentionally narrow the loaded rows, matching DataTable search.

export type { FacetFilterDefinition, PillTone };
export {
  COLUMN_DEFAULT_FILTER_OPTIONS,
  COLUMN_GENERATION_FILTER_OPTIONS,
  COLUMN_KEY_FILTER_OPTIONS,
  COLUMN_NULLABILITY_FILTER_OPTIONS,
  CONSTRAINT_TYPE_LABELS,
  IDENTITY_GENERATION_LABELS,
  isTriggerStateFilter,
  PILL_TONE_CLASSES,
  presentColumnOptions,
  presentConstraintKindOptions,
  presentIndexMethodOptions,
  presentPolicyModeOptions,
  presentTriggerStateOptions,
  TABLE_DETAIL_TAB_DEFINITIONS,
  TABLE_DETAIL_TABS,
  TABLE_TYPE_LABELS,
  uniqueSortedOptions,
};
