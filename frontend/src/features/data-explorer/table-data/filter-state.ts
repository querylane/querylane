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
const FLOAT_LITERAL_PATTERN = /^-?(?:\d+(?:\.\d*)?|\.\d+)(?:[eE][+-]?\d+)?$/;
const INTEGER_LITERAL_PATTERN = /^-?\d+$/;
// Postgres uuid_in also accepts upper-case digits, surrounding braces, and a
// hyphen after any group of four digits (or no hyphens at all) — not just the
// canonical 8-4-4-4-12 form.
const UUID_LITERAL_PATTERN = /^(?:[0-9a-f]{4}-?){7}[0-9a-f]{4}$/i;

const FILTER_OPERATORS = [
  "eq",
  "ne",
  "gt",
  "gte",
  "lt",
  "lte",
  "like",
  "ilike",
  "match",
  "imatch",
  "in",
  "notIn",
  "isNull",
  "isNotNull",
  "isTrue",
  "isFalse",
  "isUnknown",
  "isDistinct",
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
  /** Joins this rule to the preceding rule. The first rule ignores it. */
  logic?: TableFilterLogic | undefined;
  negated?: boolean | undefined;
  operator: FilterOperator;
  value: string;
  value2?: string | undefined;
}

interface FilterColumnMeta {
  columnName: string;
  dataType: DataType;
  rawType?: string | undefined;
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

interface FilterChild {
  filter: RowFilter;
  logic?: TableFilterLogic | undefined;
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
  imatch: {
    description: "Matches a POSIX regular expression; ignores letter case.",
    displayLabel: "Matches regular expression, case-insensitive",
    label: "~*",
    proto: RowPredicate_Operator.IMATCH,
    valueCount: 1,
  },
  in: {
    description: "Matches any value in a comma-separated list.",
    displayLabel: "Is one of",
    label: "in",
    proto: RowPredicate_Operator.IN,
    valueCount: "list",
  },
  isDistinct: {
    description: "Differs from this value, treating NULL as a value.",
    displayLabel: "Is distinct from",
    label: "is distinct from",
    proto: RowPredicate_Operator.IS_DISTINCT,
    valueCount: 1,
  },
  isFalse: {
    description: "Keeps rows where the boolean value is false.",
    displayLabel: "Is false",
    label: "is false",
    proto: RowPredicate_Operator.IS_FALSE,
    valueCount: 0,
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
  isTrue: {
    description: "Keeps rows where the boolean value is true.",
    displayLabel: "Is true",
    label: "is true",
    proto: RowPredicate_Operator.IS_TRUE,
    valueCount: 0,
  },
  isUnknown: {
    description: "Keeps rows where the boolean value is NULL.",
    displayLabel: "Is unknown",
    label: "is unknown",
    proto: RowPredicate_Operator.IS_UNKNOWN,
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
  match: {
    description: "Matches a POSIX regular expression.",
    displayLabel: "Matches regular expression",
    label: "~",
    proto: RowPredicate_Operator.MATCH,
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

function createFilterRule(
  column = "",
  logic?: TableFilterLogic
): TableFilterRule {
  return {
    column,
    id: crypto.randomUUID?.() ?? `filter-${Date.now()}`,
    ...(logic === undefined ? {} : { logic }),
    operator: "eq",
    value: "",
  };
}

function parseBooleanTableValue(value: string): TableValue | undefined {
  const lower = value.toLowerCase();
  if (lower !== "true" && lower !== "false") {
    return undefined;
  }
  return create(TableValueSchema, {
    kind: { case: "boolValue", value: lower === "true" },
  });
}

function parseFloatTableValue(
  rawValue: string,
  value: string
): TableValue | undefined {
  if (!FLOAT_LITERAL_PATTERN.test(rawValue)) {
    return undefined;
  }
  const numberValue = Number(value);
  return Number.isFinite(numberValue)
    ? create(TableValueSchema, {
        kind: { case: "doubleValue", value: numberValue },
      })
    : undefined;
}

function parseIntegerTableValue(value: string): TableValue | undefined {
  return INTEGER_LITERAL_PATTERN.test(value)
    ? create(TableValueSchema, {
        kind: { case: "int64Value", value: BigInt(value) },
      })
    : undefined;
}

const compactRuleSearchSchema = z.object({
  c: z.string().min(1),
  i: z.string().min(1),
  l: z.enum(FILTER_LOGICS).optional(),
  n: z.boolean().optional(),
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
          ...(rule.l === undefined ? {} : { logic: rule.l }),
          ...(rule.n === undefined ? {} : { negated: rule.n }),
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
      ...(rule.logic === undefined ? {} : { l: rule.logic }),
      ...(rule.negated ? { n: true } : {}),
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

function expectedFilterValueDescription(
  dataType: DataType,
  operator: FilterOperator
): string {
  if (operator === "jsonContains" || dataType === DataType.JSON) {
    return 'JSON, like {"tier":"enterprise"} or "text"';
  }
  switch (dataType) {
    case DataType.BOOLEAN:
      return "true or false";
    case DataType.INTEGER:
      return "a whole number, like 42";
    case DataType.FLOAT:
      return "a number, like 3.14";
    case DataType.DATE:
      return "a date, like 2026-05-01";
    case DataType.TIME:
      return "a time, like 13:30:00";
    case DataType.TIMESTAMP:
      return "a timestamp, like 2026-05-01 13:30:00";
    case DataType.UUID:
      return "a UUID, like 1b4e28ba-2fa1-11d2-883f-0016d3cca427";
    default:
      return "a valid value";
  }
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
      if (!isOperatorAllowedForColumn(column, rule.operator)) {
        return [
          {
            id: rule.id,
            message: `${FILTER_OPERATOR_META[rule.operator].label} cannot be used with ${rule.column}.`,
          },
        ];
      }
      if (!buildPredicate(rule, column)) {
        const expected = expectedFilterValueDescription(
          column.dataType,
          rule.operator
        );
        return [
          {
            id: rule.id,
            message: `${rule.column} expects ${expected}.`,
          },
        ];
      }
      return [];
    });
}

function buildFilterLabel(rule: TableFilterRule): string {
  const operator = FILTER_OPERATOR_META[rule.operator];
  let label: string;
  if (operator.valueCount === 0) {
    label = `${rule.column} ${operator.label}`;
  } else if (operator.valueCount === 2) {
    label = `${rule.column} ${operator.label} ${rule.value} and ${rule.value2 ?? ""}`;
  } else {
    label = `${rule.column} ${operator.label} ${rule.value}`;
  }
  return rule.negated ? `not (${label})` : label;
}

// Text-like columns (including enums and other types Postgres can compare as
// text) keep every operator except JSON containment.
const BOOLEAN_IDENTITY_OPERATORS = new Set<FilterOperator>([
  "isTrue",
  "isFalse",
  "isUnknown",
]);
const TEXT_OPERATORS: readonly FilterOperator[] = FILTER_OPERATORS.filter(
  (operator) =>
    operator !== "jsonContains" && !BOOLEAN_IDENTITY_OPERATORS.has(operator)
);
// Numbers and temporal types compare and range, but LIKE would require a text
// cast the read path does not perform.
const ORDERABLE_OPERATORS: readonly FilterOperator[] = [
  "eq",
  "ne",
  "gt",
  "gte",
  "lt",
  "lte",
  "in",
  "notIn",
  "isNull",
  "isNotNull",
  "isDistinct",
  "between",
];
const LEGACY_JSON_ARRAY_OPERATORS: readonly FilterOperator[] =
  ORDERABLE_OPERATORS.filter((operator) => operator !== "isDistinct");
const BOOLEAN_OPERATORS: readonly FilterOperator[] = [
  "eq",
  "ne",
  "in",
  "notIn",
  "isNull",
  "isNotNull",
  "isTrue",
  "isFalse",
  "isUnknown",
  "isDistinct",
];
// JSON list operators are excluded because list values split on commas, which
// JSON literals routinely contain.
const JSON_OPERATORS: readonly FilterOperator[] = [
  "eq",
  "ne",
  "jsonContains",
  "isNull",
  "isNotNull",
  "isDistinct",
];
const LEGACY_JSON_OPERATORS: readonly FilterOperator[] = JSON_OPERATORS.filter(
  (operator) => operator !== "isDistinct"
);

// Set views of the per-type operator lists above (the arrays stay the source
// of truth because their order drives the operator dropdown), so membership
// checks inside per-rule loops stay constant-time.
const OPERATOR_SET_CACHE = new Map<
  readonly FilterOperator[],
  ReadonlySet<FilterOperator>
>();

function isOperatorAllowedForColumn(
  column: FilterColumnMeta | undefined,
  operator: FilterOperator
): boolean {
  const operators = getOperatorsForColumn(column);
  let operatorSet = OPERATOR_SET_CACHE.get(operators);
  if (!operatorSet) {
    operatorSet = new Set(operators);
    OPERATOR_SET_CACHE.set(operators, operatorSet);
  }
  return operatorSet.has(operator);
}

function getOperatorsForColumn(
  column: FilterColumnMeta | undefined
): readonly FilterOperator[] {
  if (!column) {
    return FILTER_OPERATORS;
  }
  switch (column.dataType) {
    case DataType.JSON:
      return column.rawType?.trim().toLowerCase() === "jsonb"
        ? JSON_OPERATORS
        : LEGACY_JSON_OPERATORS;
    case DataType.BOOLEAN:
      return BOOLEAN_OPERATORS;
    case DataType.INTEGER:
    case DataType.FLOAT:
    case DataType.DATE:
    case DataType.TIME:
    case DataType.TIMESTAMP:
    case DataType.UUID:
    // Arrays, bytea, and geometry values are written as Postgres text literals
    // and compared with the column's own operators server-side, so they keep
    // the orderable set too; types without an ordering surface a server error
    // instead of being blocked client-side.
    case DataType.BINARY:
    case DataType.GEOMETRY:
      return ORDERABLE_OPERATORS;
    case DataType.ARRAY:
      return column.rawType?.trim().toLowerCase().startsWith("json[")
        ? LEGACY_JSON_ARRAY_OPERATORS
        : ORDERABLE_OPERATORS;
    default:
      return TEXT_OPERATORS;
  }
}

function buildRowFilter(
  rules: readonly TableFilterRule[],
  columns: readonly FilterColumnMeta[],
  logic: TableFilterLogic = DEFAULT_FILTER_LOGIC
): RowFilter | undefined {
  const columnMap = new Map(
    columns.map((column) => [column.columnName, column])
  );
  const children = buildFilterChildren(rules, columnMap);
  if (children.length === 0) {
    return;
  }
  const populatedGroups = groupFilterChildrenByPrecedence(children, logic);
  if (populatedGroups.length === 1) {
    return createFilterGroup(
      populatedGroups[0] ?? [],
      RowFilterGroup_Logic.AND
    );
  }
  return createFilterGroup(
    populatedGroups.map(collapseAndFilterGroup),
    RowFilterGroup_Logic.OR
  );
}

function buildFilterChildren(
  rules: readonly TableFilterRule[],
  columnMap: ReadonlyMap<string, FilterColumnMeta>
): FilterChild[] {
  return rules.slice(0, MAX_FILTER_RULES).flatMap((rule) => {
    const column = columnMap.get(rule.column);
    const predicate = column ? buildPredicate(rule, column) : undefined;
    if (!predicate) {
      return [];
    }
    return [
      {
        filter: create(RowFilterSchema, {
          node: { case: "predicate", value: predicate },
        }),
        logic: rule.logic,
      },
    ];
  });
}

function groupFilterChildrenByPrecedence(
  children: FilterChild[],
  fallbackLogic: TableFilterLogic
): RowFilter[][] {
  const andGroups: RowFilter[][] = [[]];
  for (const child of children) {
    const currentGroup = andGroups.at(-1);
    if (
      currentGroup &&
      currentGroup.length > 0 &&
      (child.logic ?? fallbackLogic) === "or"
    ) {
      andGroups.push([child.filter]);
    } else {
      currentGroup?.push(child.filter);
    }
  }
  return andGroups.filter((group) => group.length > 0);
}

function collapseAndFilterGroup(children: RowFilter[]): RowFilter {
  const [onlyChild] = children;
  return children.length === 1 && onlyChild
    ? onlyChild
    : createFilterGroup(children, RowFilterGroup_Logic.AND);
}

function createFilterGroup(
  children: RowFilter[],
  logic: RowFilterGroup_Logic
): RowFilter {
  return create(RowFilterSchema, {
    node: {
      case: "group",
      value: create(RowFilterGroupSchema, { children, logic }),
    },
  });
}

function buildPredicate(
  rule: TableFilterRule,
  column: FilterColumnMeta
): RowPredicate | undefined {
  const meta = FILTER_OPERATOR_META[rule.operator];
  if (!isOperatorAllowedForColumn(column, rule.operator)) {
    return;
  }
  const values = buildValues(rule, column.dataType, meta.valueCount);
  if (!values) {
    return;
  }
  return create(RowPredicateSchema, {
    column: rule.column,
    negated: rule.negated ?? false,
    operator: meta.proto,
    values,
  });
}

function buildRangeValues(
  rule: TableFilterRule,
  dataType: DataType
): TableValue[] | undefined {
  const first = parseTableValue(rule.value, dataType, rule.operator);
  const second = parseTableValue(rule.value2 ?? "", dataType, rule.operator);
  return first !== undefined && second !== undefined
    ? [first, second]
    : undefined;
}

function buildListValues(
  rule: TableFilterRule,
  dataType: DataType
): TableValue[] | undefined {
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
  return values.every(
    (candidate): candidate is TableValue => candidate !== undefined
  )
    ? values
    : undefined;
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
    return buildRangeValues(rule, dataType);
  }
  if (valueCount === "list") {
    return buildListValues(rule, dataType);
  }
  const value = parseTableValue(rule.value, dataType, rule.operator);
  return value ? [value] : undefined;
}

function isUuidLiteral(value: string): boolean {
  const inner =
    value.startsWith("{") && value.endsWith("}") ? value.slice(1, -1) : value;
  return UUID_LITERAL_PATTERN.test(inner);
}

function parseJsonTableValue(value: string): TableValue | undefined {
  try {
    JSON.parse(value);
  } catch {
    return undefined;
  }
  return create(TableValueSchema, { kind: { case: "jsonValue", value } });
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
    return parseJsonTableValue(value);
  }
  switch (dataType) {
    case DataType.BOOLEAN: {
      return parseBooleanTableValue(value);
    }
    case DataType.FLOAT: {
      return parseFloatTableValue(rawValue, value);
    }
    case DataType.INTEGER: {
      return parseIntegerTableValue(value);
    }
    case DataType.UUID: {
      return isUuidLiteral(value)
        ? create(TableValueSchema, { kind: { case: "stringValue", value } })
        : undefined;
    }
    case DataType.TIME:
    case DataType.DATE:
    case DataType.TIMESTAMP:
      // Deliberately unvalidated: Postgres accepts DateStyle-dependent
      // formats, timezone offsets, and keywords like `now` that no client
      // check can predict, so the server stays the authority and a bad value
      // surfaces its error instead of being blocked here.
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
  isIncompleteFilterRule,
  MAX_FILTER_RULES,
  parseTableFilterSearch,
  parseTableFilterSearchResult,
  serializeTableFilterSearch,
};
