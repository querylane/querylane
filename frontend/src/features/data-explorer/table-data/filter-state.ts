import { create } from "@bufbuild/protobuf";
import { z } from "zod";
import {
  type RowFilter,
  RowFilterGroup_Logic,
  RowFilterGroupSchema,
  RowFilterSchema,
  type RowPredicate,
  RowPredicate_Operator,
  RowPredicateSchema,
  type TableValue,
  TableValueSchema,
} from "@/protogen/querylane/console/v1alpha1/table_data_pb";
import { DataType } from "@/protogen/querylane/console/v1alpha1/table_pb";

const MAX_FILTER_RULES = 64;
const DEFAULT_FILTER_LOGIC = "and" as const;
const FILTER_LOGICS = ["and", "or"] as const;
const INTEGER_LITERAL_PATTERN = /^-?\d+$/;

const FILTER_OPERATORS = [
  "eq",
  "ne",
  "gt",
  "gte",
  "lt",
  "lte",
  "like",
  "ilike",
  "in",
  "notIn",
  "isNull",
  "isNotNull",
  "between",
  "jsonContains",
] as const;

type FilterOperator = (typeof FILTER_OPERATORS)[number];
type TableFilterLogic = (typeof FILTER_LOGICS)[number];

interface TableFilterState {
  logic: TableFilterLogic;
  rules: TableFilterRule[];
}

type TableFilterSearchParseResult =
  | { error: null; ok: true; state: TableFilterState }
  | { error: string; ok: false; state: TableFilterState };

interface TableFilterRule {
  column: string;
  id: string;
  operator: FilterOperator;
  value: string;
  value2?: string | undefined;
}

interface FilterColumnMeta {
  columnName: string;
  dataType: DataType;
}

interface InvalidFilterRule {
  id: string;
  message: string;
}

interface FilterOperatorMeta {
  description: string;
  displayLabel: string;
  label: string;
  proto: RowPredicate_Operator;
  valueCount: 0 | 1 | 2 | "list";
}

const FILTER_OPERATOR_META: Record<FilterOperator, FilterOperatorMeta> = {
  between: {
    description: "Keeps rows inside an inclusive range.",
    displayLabel: "Is between",
    label: "between",
    proto: RowPredicate_Operator.BETWEEN,
    valueCount: 2,
  },
  eq: {
    description: "Matches exactly.",
    displayLabel: "Equals",
    label: "=",
    proto: RowPredicate_Operator.EQUAL,
    valueCount: 1,
  },
  gt: {
    description: "Keeps rows greater than this value.",
    displayLabel: "Greater than",
    label: ">",
    proto: RowPredicate_Operator.GREATER_THAN,
    valueCount: 1,
  },
  gte: {
    description: "Keeps rows greater than or equal to this value.",
    displayLabel: "Greater than or equal",
    label: ">=",
    proto: RowPredicate_Operator.GREATER_THAN_OR_EQUAL,
    valueCount: 1,
  },
  ilike: {
    description: "Use % as a wildcard; ignores letter case.",
    displayLabel: "Contains text, case-insensitive",
    label: "ILIKE",
    proto: RowPredicate_Operator.ILIKE,
    valueCount: 1,
  },
  in: {
    description: "Matches any value in a comma-separated list.",
    displayLabel: "Is one of",
    label: "in",
    proto: RowPredicate_Operator.IN,
    valueCount: "list",
  },
  isNotNull: {
    description: "Keeps rows where the column has a value.",
    displayLabel: "Has a value",
    label: "is not null",
    proto: RowPredicate_Operator.IS_NOT_NULL,
    valueCount: 0,
  },
  isNull: {
    description: "Keeps rows where the column is NULL.",
    displayLabel: "Is empty",
    label: "is null",
    proto: RowPredicate_Operator.IS_NULL,
    valueCount: 0,
  },
  jsonContains: {
    description: "Matches rows whose JSON contains this object or value.",
    displayLabel: "Contains JSON",
    label: "contains JSON",
    proto: RowPredicate_Operator.JSON_CONTAINS,
    valueCount: 1,
  },
  like: {
    description: "Use % as a wildcard.",
    displayLabel: "Contains text",
    label: "LIKE",
    proto: RowPredicate_Operator.LIKE,
    valueCount: 1,
  },
  lt: {
    description: "Keeps rows less than this value.",
    displayLabel: "Less than",
    label: "<",
    proto: RowPredicate_Operator.LESS_THAN,
    valueCount: 1,
  },
  lte: {
    description: "Keeps rows less than or equal to this value.",
    displayLabel: "Less than or equal",
    label: "<=",
    proto: RowPredicate_Operator.LESS_THAN_OR_EQUAL,
    valueCount: 1,
  },
  ne: {
    description: "Excludes exact matches.",
    displayLabel: "Does not equal",
    label: "!=",
    proto: RowPredicate_Operator.NOT_EQUAL,
    valueCount: 1,
  },
  notIn: {
    description: "Excludes values in a comma-separated list.",
    displayLabel: "Is not one of",
    label: "not in",
    proto: RowPredicate_Operator.NOT_IN,
    valueCount: "list",
  },
};

const OPERATOR_SET = new Set<string>(FILTER_OPERATORS);
const FILTER_LOGIC_SET = new Set<string>(FILTER_LOGICS);
const TABLE_FILTER_SEARCH_PARSE_ERROR_MESSAGE =
  "Filter URL is malformed. Clear the filter and try again.";

function isFilterOperator(value: string): value is FilterOperator {
  return OPERATOR_SET.has(value);
}

function isFilterLogic(value: string): value is TableFilterLogic {
  return FILTER_LOGIC_SET.has(value);
}

function createFilterRule(column = ""): TableFilterRule {
  return {
    column,
    id: crypto.randomUUID?.() ?? `filter-${Date.now()}`,
    operator: "eq",
    value: "",
  };
}

const compactRuleSearchSchema = z.object({
  c: z.string().min(1),
  i: z.string().min(1),
  o: z.enum(FILTER_OPERATORS),
  v: z.string().default(""),
  v2: z.string().optional(),
});

const tableFilterSearchSchema = z.object({
  l: z.enum(FILTER_LOGICS).default(DEFAULT_FILTER_LOGIC),
  r: z.array(compactRuleSearchSchema).default([]),
});

function emptyFilterState(): TableFilterState {
  return { logic: DEFAULT_FILTER_LOGIC, rules: [] };
}

function parseTableFilterSearchResult(
  value: string | undefined
): TableFilterSearchParseResult {
  if (!value) {
    return { error: null, ok: true, state: emptyFilterState() };
  }

  try {
    const parsed = tableFilterSearchSchema.safeParse(JSON.parse(value));
    if (!parsed.success) {
      return {
        error: TABLE_FILTER_SEARCH_PARSE_ERROR_MESSAGE,
        ok: false,
        state: emptyFilterState(),
      };
    }
    return {
      error: null,
      ok: true,
      state: {
        logic: parsed.data.l,
        rules: parsed.data.r.slice(0, MAX_FILTER_RULES).map((rule) => ({
          column: rule.c,
          id: rule.i,
          operator: rule.o,
          value: rule.v,
          value2: rule.v2,
        })),
      },
    };
  } catch {
    return {
      error: TABLE_FILTER_SEARCH_PARSE_ERROR_MESSAGE,
      ok: false,
      state: emptyFilterState(),
    };
  }
}

function parseTableFilterSearch(value: string | undefined): TableFilterState {
  return parseTableFilterSearchResult(value).state;
}

function serializeTableFilterSearch(
  state: Readonly<TableFilterState>
): string | undefined {
  if (state.rules.length === 0 && state.logic === DEFAULT_FILTER_LOGIC) {
    return;
  }
  return JSON.stringify({
    l: state.logic,
    r: state.rules.slice(0, MAX_FILTER_RULES).map((rule) => ({
      c: rule.column,
      i: rule.id,
      o: rule.operator,
      v: rule.value,
      ...(rule.value2 === undefined ? {} : { v2: rule.value2 }),
    })),
  });
}

function filterRulesForColumnNames(
  rules: readonly TableFilterRule[],
  columnNames: readonly string[]
): TableFilterRule[] {
  const allowed = new Set(columnNames);
  return rules.filter((rule) => allowed.has(rule.column));
}

function filterStateForColumnNames(
  state: Readonly<TableFilterState>,
  columnNames: readonly string[]
): TableFilterState {
  return {
    logic: state.logic,
    rules: filterRulesForColumnNames(state.rules, columnNames),
  };
}

// A rule whose required value is still empty is "incomplete": the user is
// mid-edit, so it is excluded from both the row filter request and the
// invalid list instead of raising a destructive alert and pausing the query.
function isIncompleteFilterRule(rule: TableFilterRule): boolean {
  const meta = FILTER_OPERATOR_META[rule.operator];
  if (meta.valueCount === 0) {
    return false;
  }
  if (meta.valueCount === 2) {
    return rule.value.trim() === "" || (rule.value2 ?? "").trim() === "";
  }
  return rule.value.trim() === "";
}

function getInvalidFilterRules(
  rules: readonly TableFilterRule[],
  columns: readonly FilterColumnMeta[]
): InvalidFilterRule[] {
  const columnMap = new Map(
    columns.map((column) => [column.columnName, column])
  );
  return rules
    .slice(0, MAX_FILTER_RULES)
    .flatMap((rule): InvalidFilterRule[] => {
      const column = columnMap.get(rule.column);
      if (!column) {
        return [{ id: rule.id, message: `${rule.column} is not available.` }];
      }
      if (isIncompleteFilterRule(rule)) {
        return [];
      }
      if (!getOperatorsForColumn(column).includes(rule.operator)) {
        return [
          {
            id: rule.id,
            message: `${rule.operator} cannot be used with ${rule.column}.`,
          },
        ];
      }
      if (!buildPredicate(rule, column)) {
        return [
          {
            id: rule.id,
            message: `${rule.column} has an invalid filter value.`,
          },
        ];
      }
      return [];
    });
}

function buildFilterLabel(rule: TableFilterRule): string {
  const operator = FILTER_OPERATOR_META[rule.operator];
  if (operator.valueCount === 0) {
    return `${rule.column} ${operator.label}`;
  }
  if (operator.valueCount === 2) {
    return `${rule.column} ${operator.label} ${rule.value} and ${rule.value2 ?? ""}`;
  }
  return `${rule.column} ${operator.label} ${rule.value}`;
}

function getOperatorsForColumn(
  column: FilterColumnMeta | undefined
): readonly FilterOperator[] {
  if (!column) {
    return FILTER_OPERATORS;
  }
  if (column.dataType === DataType.JSON) {
    return FILTER_OPERATORS;
  }
  return FILTER_OPERATORS.filter((operator) => operator !== "jsonContains");
}

function buildRowFilter(
  rules: readonly TableFilterRule[],
  columns: readonly FilterColumnMeta[],
  logic: TableFilterLogic = DEFAULT_FILTER_LOGIC
): RowFilter | undefined {
  const columnMap = new Map(
    columns.map((column) => [column.columnName, column])
  );
  const children: RowFilter[] = [];

  for (const rule of rules.slice(0, MAX_FILTER_RULES)) {
    const column = columnMap.get(rule.column);
    if (!column) {
      continue;
    }
    const predicate = buildPredicate(rule, column);
    if (!predicate) {
      continue;
    }
    children.push(
      create(RowFilterSchema, {
        node: { case: "predicate", value: predicate },
      })
    );
  }

  if (children.length === 0) {
    return;
  }
  return create(RowFilterSchema, {
    node: {
      case: "group",
      value: create(RowFilterGroupSchema, {
        children,
        logic:
          logic === "or" ? RowFilterGroup_Logic.OR : RowFilterGroup_Logic.AND,
      }),
    },
  });
}

function buildPredicate(
  rule: TableFilterRule,
  column: FilterColumnMeta
): RowPredicate | undefined {
  const meta = FILTER_OPERATOR_META[rule.operator];
  if (!getOperatorsForColumn(column).includes(rule.operator)) {
    return;
  }
  const values = buildValues(rule, column.dataType, meta.valueCount);
  if (!values) {
    return;
  }
  return create(RowPredicateSchema, {
    column: rule.column,
    operator: meta.proto,
    values,
  });
}

function buildValues(
  rule: TableFilterRule,
  dataType: DataType,
  valueCount: FilterOperatorMeta["valueCount"]
): TableValue[] | undefined {
  if (valueCount === 0) {
    return [];
  }
  if (valueCount === 2) {
    const first = parseTableValue(rule.value, dataType, rule.operator);
    const second = parseTableValue(rule.value2 ?? "", dataType, rule.operator);
    return first && second ? [first, second] : undefined;
  }
  if (valueCount === "list") {
    const parts = rule.value
      .split(",")
      .map((part) => part.trim())
      .filter(Boolean);
    if (parts.length === 0) {
      return;
    }
    const values = parts.map((part) =>
      parseTableValue(part, dataType, rule.operator)
    );
    return values.every((value): value is TableValue => value !== undefined)
      ? values
      : undefined;
  }
  const value = parseTableValue(rule.value, dataType, rule.operator);
  return value ? [value] : undefined;
}

function parseTableValue(
  rawValue: string,
  dataType: DataType,
  operator: FilterOperator
): TableValue | undefined {
  const value = rawValue.trim();
  if (!value) {
    return;
  }
  if (operator === "jsonContains" || dataType === DataType.JSON) {
    return create(TableValueSchema, { kind: { case: "jsonValue", value } });
  }
  switch (dataType) {
    case DataType.BOOLEAN: {
      const lower = value.toLowerCase();
      if (lower === "true") {
        return create(TableValueSchema, {
          kind: { case: "boolValue", value: true },
        });
      }
      if (lower === "false") {
        return create(TableValueSchema, {
          kind: { case: "boolValue", value: false },
        });
      }
      return;
    }
    case DataType.FLOAT:
      return Number.isFinite(Number(value))
        ? create(TableValueSchema, {
            kind: { case: "doubleValue", value: Number(value) },
          })
        : undefined;
    case DataType.INTEGER: {
      if (!INTEGER_LITERAL_PATTERN.test(value)) {
        return;
      }
      return create(TableValueSchema, {
        kind: { case: "int64Value", value: BigInt(value) },
      });
    }
    case DataType.DATE:
    case DataType.TIME:
    case DataType.TIMESTAMP:
      return create(TableValueSchema, {
        kind: { case: "timestampValue", value },
      });
    default:
      return create(TableValueSchema, { kind: { case: "stringValue", value } });
  }
}

export type {
  FilterColumnMeta,
  TableFilterLogic,
  TableFilterRule,
  TableFilterSearchParseResult,
};
export {
  buildFilterLabel,
  buildRowFilter,
  createFilterRule,
  FILTER_OPERATOR_META,
  filterRulesForColumnNames,
  filterStateForColumnNames,
  getInvalidFilterRules,
  getOperatorsForColumn,
  isFilterLogic,
  isFilterOperator,
  MAX_FILTER_RULES,
  parseTableFilterSearch,
  parseTableFilterSearchResult,
  serializeTableFilterSearch,
};
