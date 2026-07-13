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

type SqlWhereFilterParseResult =
  | { error: null; ok: true; rules: TableFilterRule[] }
  | { error: string; ok: false; rules: [] };

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
const SQL_WHERE_PARSE_ERROR_PREFIX =
  "SQL WHERE supports column comparisons joined with AND only. Check the condition near";
const SQL_AND_TOKEN = "AND";
const SQL_AND_TOKEN_LENGTH = SQL_AND_TOKEN.length;
const SQL_RULE_ID_MAX_COLUMN_LENGTH = 40;
const SQL_WHERE_PREFIX_PATTERN = /^where\s+/i;
const SQL_WORD_CHARACTER_PATTERN = /[A-Za-z0-9_$]/;
const NON_WHITESPACE_PATTERN = /\S/;
const SQL_IDENTIFIER_PATTERN = /^[A-Za-z_][A-Za-z0-9_$]*/;
const SQL_BARE_LITERAL_TOKEN_PATTERN = /^\S+/;
const BARE_LITERAL_PATTERN = /^[^\s();'"]+$/;
const NUMERIC_LITERAL_PATTERN = /^-?(?:\d+|\d+\.\d+|\.\d+)$/;
const SQL_IS_NULL_PATTERN = /^IS\s+NULL$/i;
const SQL_IS_NOT_NULL_PATTERN = /^IS\s+NOT\s+NULL$/i;
const SQL_WORD_OPERATOR_PATTERN = /^(>=|<=|<>|!=|=|>|<|ILIKE|LIKE)\b/i;
const SQL_SYMBOL_OPERATOR_PATTERN = /^(>=|<=|<>|!=|=|>|<)/;

const SQL_OPERATOR_TO_FILTER_OPERATOR: Record<string, FilterOperator> = {
  "!=": "ne",
  "<": "lt",
  "<=": "lte",
  "<>": "ne",
  "=": "eq",
  ">": "gt",
  ">=": "gte",
  ilike: "ilike",
  like: "like",
};

const FILTER_OPERATOR_TO_SQL_OPERATOR: Partial<Record<FilterOperator, string>> =
  {
    eq: "=",
    gt: ">",
    gte: ">=",
    ilike: "ILIKE",
    isNotNull: "IS NOT NULL",
    isNull: "IS NULL",
    like: "LIKE",
    lt: "<",
    lte: "<=",
    ne: "<>",
  };

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

function normalizeSqlWhereInput(value: string): string {
  return value.trim().replace(SQL_WHERE_PREFIX_PATTERN, "").trim();
}

function formatSqlWhereParseError(condition: string): string {
  return `${SQL_WHERE_PARSE_ERROR_PREFIX} "${condition.trim()}".`;
}

function isSqlWordBoundary(value: string | undefined): boolean {
  return value === undefined || !SQL_WORD_CHARACTER_PATTERN.test(value);
}

function skipSqlQuotedIdentifier(
  value: string,
  start: number
): number | undefined {
  let index = start + 1;
  while (index < value.length) {
    if (value[index] === '"') {
      if (value[index + 1] === '"') {
        index += 2;
        continue;
      }
      return index + 1;
    }
    index += 1;
  }
  return;
}

function skipSqlQuotedString(value: string, start: number): number | undefined {
  const literal = readSqlStringLiteral(value.slice(start));
  return literal ? start + literal.next : undefined;
}

function isSqlAndAt(value: string, index: number): boolean {
  return (
    value.slice(index, index + SQL_AND_TOKEN_LENGTH).toUpperCase() ===
      SQL_AND_TOKEN &&
    isSqlWordBoundary(value[index - 1]) &&
    isSqlWordBoundary(value[index + SQL_AND_TOKEN_LENGTH])
  );
}

function splitSqlWhereConditions(value: string): string[] | undefined {
  const parts: string[] = [];
  let start = 0;
  let index = 0;

  while (index < value.length) {
    const char = value[index];
    if (char === "'") {
      const next = skipSqlQuotedString(value, index);
      if (!next) {
        return;
      }
      index = next;
      continue;
    }
    if (char === '"') {
      const next = skipSqlQuotedIdentifier(value, index);
      if (!next) {
        return;
      }
      index = next;
      continue;
    }

    if (isSqlAndAt(value, index)) {
      parts.push(value.slice(start, index).trim());
      index += SQL_AND_TOKEN_LENGTH;
      start = index;
      continue;
    }

    index += 1;
  }

  parts.push(value.slice(start).trim());
  return parts;
}

function readSqlIdentifier(
  value: string
): { column: string; next: number } | undefined {
  const trimmedStart = value.search(NON_WHITESPACE_PATTERN);
  if (trimmedStart < 0) {
    return;
  }
  if (value[trimmedStart] === '"') {
    let column = "";
    let index = trimmedStart + 1;
    while (index < value.length) {
      const char = value[index];
      if (char === '"') {
        if (value[index + 1] === '"') {
          column += '"';
          index += 2;
          continue;
        }
        return { column, next: index + 1 };
      }
      column += char;
      index += 1;
    }
    return;
  }

  const match = SQL_IDENTIFIER_PATTERN.exec(value.slice(trimmedStart));
  if (!match) {
    return;
  }
  return { column: match[0], next: trimmedStart + match[0].length };
}

function readSqlStringLiteral(
  value: string
): { next: number; value: string } | undefined {
  let literal = "";
  let index = 1;
  while (index < value.length) {
    const char = value[index];
    if (char === "'") {
      if (value[index + 1] === "'") {
        literal += "'";
        index += 2;
        continue;
      }
      return { next: index + 1, value: literal };
    }
    literal += char;
    index += 1;
  }
  return;
}

function readSqlLiteral(
  value: string
): { next: number; value: string } | undefined {
  const rest = value.trimStart();
  const offset = value.length - rest.length;
  if (rest.startsWith("'")) {
    const literal = readSqlStringLiteral(rest);
    return literal
      ? { next: offset + literal.next, value: literal.value }
      : undefined;
  }

  const match = SQL_BARE_LITERAL_TOKEN_PATTERN.exec(rest);
  if (!(match && BARE_LITERAL_PATTERN.test(match[0]))) {
    return;
  }
  return { next: offset + match[0].length, value: match[0] };
}

function sqlRuleId(index: number, column: string): string {
  const columnSlug =
    column
      .toLowerCase()
      .replace(/[^a-z0-9_$-]+/g, "-")
      .replace(/^-+|-+$/g, "")
      .slice(0, SQL_RULE_ID_MAX_COLUMN_LENGTH) || "column";
  return `sql-${index + 1}-${columnSlug}`;
}

function parseSqlWhereCondition(
  condition: string,
  index: number
): TableFilterRule | undefined {
  const identifier = readSqlIdentifier(condition);
  if (!identifier?.column) {
    return;
  }

  const rest = condition.slice(identifier.next).trimStart();
  if (SQL_IS_NULL_PATTERN.test(rest)) {
    return {
      column: identifier.column,
      id: sqlRuleId(index, identifier.column),
      operator: "isNull",
      value: "",
    };
  }

  if (SQL_IS_NOT_NULL_PATTERN.test(rest)) {
    return {
      column: identifier.column,
      id: sqlRuleId(index, identifier.column),
      operator: "isNotNull",
      value: "",
    };
  }

  const operatorMatch =
    SQL_WORD_OPERATOR_PATTERN.exec(rest) ??
    SQL_SYMBOL_OPERATOR_PATTERN.exec(rest);
  if (!operatorMatch) {
    return;
  }

  const rawOperator = operatorMatch[1] ?? "";
  const operator =
    SQL_OPERATOR_TO_FILTER_OPERATOR[rawOperator.toLowerCase()] ??
    SQL_OPERATOR_TO_FILTER_OPERATOR[rawOperator];
  if (!operator) {
    return;
  }

  const literal = readSqlLiteral(rest.slice(rawOperator.length));
  if (!literal) {
    return;
  }

  const trailing = rest.slice(rawOperator.length + literal.next).trim();
  if (trailing) {
    return;
  }

  return {
    column: identifier.column,
    id: sqlRuleId(index, identifier.column),
    operator,
    value: literal.value,
  };
}

function parseSqlWhereFilter(value: string): SqlWhereFilterParseResult {
  const normalized = normalizeSqlWhereInput(value);
  if (!normalized) {
    return { error: null, ok: true, rules: [] };
  }

  const conditions = splitSqlWhereConditions(normalized);
  if (!conditions || conditions.some((condition) => condition.length === 0)) {
    return {
      error: formatSqlWhereParseError(normalized),
      ok: false,
      rules: [],
    };
  }

  const rules: TableFilterRule[] = [];
  for (let index = 0; index < conditions.length; index += 1) {
    const condition = conditions[index] ?? "";
    const rule = parseSqlWhereCondition(condition, index);
    if (!rule) {
      return {
        error: formatSqlWhereParseError(condition),
        ok: false,
        rules: [],
      };
    }
    rules.push(rule);
  }

  return { error: null, ok: true, rules };
}

function quoteSqlIdentifier(value: string): string {
  return `"${value.replaceAll('"', '""')}"`;
}

function quoteSqlLiteral(value: string): string {
  return `'${value.replaceAll("'", "''")}'`;
}

function formatSqlLiteral(value: string): string {
  const trimmed = value.trim();
  if (
    NUMERIC_LITERAL_PATTERN.test(trimmed) ||
    trimmed.toLowerCase() === "true" ||
    trimmed.toLowerCase() === "false"
  ) {
    return trimmed;
  }
  return quoteSqlLiteral(value);
}

function serializeSqlWhereFilterRules(
  rules: readonly TableFilterRule[]
): string | undefined {
  const parts: string[] = [];
  for (const rule of rules) {
    const operator = FILTER_OPERATOR_TO_SQL_OPERATOR[rule.operator];
    if (!operator) {
      return;
    }
    if (rule.operator === "isNull" || rule.operator === "isNotNull") {
      parts.push(`${quoteSqlIdentifier(rule.column)} ${operator}`);
      continue;
    }
    if (!rule.value.trim()) {
      return;
    }
    parts.push(
      `${quoteSqlIdentifier(rule.column)} ${operator} ${formatSqlLiteral(
        rule.value
      )}`
    );
  }
  return parts.length > 0 ? parts.join(" AND ") : undefined;
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
  SqlWhereFilterParseResult,
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
  parseSqlWhereFilter,
  parseTableFilterSearch,
  parseTableFilterSearchResult,
  serializeSqlWhereFilterRules,
  serializeTableFilterSearch,
};
