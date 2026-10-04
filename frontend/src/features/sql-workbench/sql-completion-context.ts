import { type Completion, snippetCompletion } from "@codemirror/autocomplete";
import type {
  CompletionColumn,
  ReferencedRelation,
} from "@/features/sql-workbench/sql-completion-schema";
import {
  relationKey,
  type SqlRelation,
} from "@/features/sql-workbench/sql-relation";
import { splitSqlStatements } from "@/features/sql-workbench/sql-statements";

/**
 * Where the cursor sits inside a statement, which decides what is worth
 * suggesting:
 * - `statement`: nothing typed yet but (part of) the first keyword.
 * - `expression`: a column list or condition (SELECT, WHERE, ON, HAVING,
 *   GROUP/ORDER BY, SET, RETURNING): columns, functions, operators.
 * - `relation`: after FROM/JOIN/UPDATE/INTO: tables and clause keywords.
 * - `alias`: right after AS: the user is naming something, suggest nothing.
 * - `other`: LIMIT/OFFSET and similar: clause keywords only.
 */
type CompletionClause =
  | "alias"
  | "expression"
  | "other"
  | "relation"
  | "statement";

const STRING_OR_COMMENT_PATTERN =
  /'(?:[^']|'')*'?|"(?:[^"]|"")*"?|--[^\n]*|\/\*[\s\S]*?(?:\*\/|$)/g;
const CLOSED_GROUP_PATTERN = /\([^()]*\)/g;
const CLAUSE_KEYWORD_PATTERN =
  /\b(select|from|join|where|on|having|group\s+by|order\s+by|partition\s+by|limit|offset|update|into|set|values|returning|as|with)\b/gi;
const PARTIAL_WORD_PATTERN = /[\w$]*$/;
const EXPRESSION_CLAUSES = new Set([
  "group by",
  "having",
  "on",
  "order by",
  "partition by",
  "returning",
  "select",
  "set",
  "values",
  "where",
]);
const RELATION_CLAUSES = new Set(["from", "into", "join", "update"]);

/**
 * Collapses what cannot affect the clause at the cursor: string literals,
 * quoted identifiers and comments (which may contain keywords), and
 * parenthesised groups that are already closed (a finished sub-query).
 * Groups still open around the cursor stay, so a sub-query in progress is
 * read on its own.
 */
function normalizeBeforeCursor(textBefore: string): string {
  let text = textBefore.replace(STRING_OR_COMMENT_PATTERN, " x ");
  let previous = "";
  while (previous !== text) {
    previous = text;
    text = text.replace(CLOSED_GROUP_PATTERN, " x ");
  }
  const openGroup = text.lastIndexOf("(");
  return openGroup === -1 ? text : text.slice(openGroup + 1);
}

/** Classifies the cursor position from the statement text before it. */
function completionClause(statementBefore: string): CompletionClause {
  const text = normalizeBeforeCursor(statementBefore);
  const withoutPartial = text.replace(PARTIAL_WORD_PATTERN, "");
  let last: string | undefined;
  for (const [, keyword] of withoutPartial.matchAll(CLAUSE_KEYWORD_PATTERN)) {
    last = keyword;
  }
  if (last === undefined) {
    return withoutPartial.trim() === "" ? "statement" : "other";
  }
  const clause = last.toLowerCase().replace(/\s+/g, " ");
  if (clause === "as") {
    return withoutPartial.trimEnd().toLowerCase().endsWith("as")
      ? "alias"
      : "expression";
  }
  if (EXPRESSION_CLAUSES.has(clause)) {
    return "expression";
  }
  if (RELATION_CLAUSES.has(clause)) {
    return "relation";
  }
  return "other";
}

// Ranking among equally good matches, highest first. lang-sql's own table
// and schema entries carry boosts 2 and 1 (see sql-completion-schema.ts).
const IN_SCOPE_COLUMN_BOOST = 10;
const SCHEMA_COLUMN_BOOST = 6;
const FUNCTION_BOOST = 4;
const KEYWORD_BOOST = -2;

const STATEMENT_KEYWORDS = [
  "SELECT",
  "WITH",
  "EXPLAIN",
  "EXPLAIN ANALYZE",
  "SHOW",
  "VALUES",
  "TABLE",
];
const CLAUSE_KEYWORDS = [
  "FROM",
  "WHERE",
  "JOIN",
  "LEFT JOIN",
  "INNER JOIN",
  "RIGHT JOIN",
  "FULL JOIN",
  "CROSS JOIN",
  "ON",
  "USING",
  "GROUP BY",
  "HAVING",
  "ORDER BY",
  "LIMIT",
  "OFFSET",
  "UNION",
  "UNION ALL",
  "INTERSECT",
  "EXCEPT",
  "AS",
];
const EXPRESSION_KEYWORDS = [
  "DISTINCT",
  "CASE",
  "WHEN",
  "THEN",
  "ELSE",
  "END",
  "AND",
  "OR",
  "NOT",
  "NULL",
  "TRUE",
  "FALSE",
  "IN",
  "IS",
  "LIKE",
  "ILIKE",
  "BETWEEN",
  "EXISTS",
  "ANY",
  "ALL",
  "CAST",
  "INTERVAL",
  "CURRENT_DATE",
  "CURRENT_TIMESTAMP",
  "OVER",
  "PARTITION BY",
  "FILTER",
  "ASC",
  "DESC",
  "NULLS FIRST",
  "NULLS LAST",
];
/** The functions people reach for in day-to-day reads, not the full catalog. */
const COMMON_FUNCTIONS = [
  "count",
  "sum",
  "avg",
  "min",
  "max",
  "coalesce",
  "nullif",
  "greatest",
  "least",
  "now",
  "date_trunc",
  "extract",
  "age",
  "to_char",
  "to_date",
  "lower",
  "upper",
  "length",
  "trim",
  "substring",
  "replace",
  "concat",
  "split_part",
  "string_agg",
  "array_agg",
  "json_agg",
  "jsonb_agg",
  "jsonb_build_object",
  "row_number",
  "rank",
  "dense_rank",
  "lag",
  "lead",
  "round",
  "abs",
  "generate_series",
  "pg_size_pretty",
];

function keywordCompletions(keywords: readonly string[]): Completion[] {
  return keywords.map((label) => ({
    boost: KEYWORD_BOOST,
    label,
    type: "keyword",
  }));
}

const STATEMENT_OPTIONS = keywordCompletions(STATEMENT_KEYWORDS);
const RELATION_OPTIONS = keywordCompletions(CLAUSE_KEYWORDS);
const EXPRESSION_KEYWORD_OPTIONS = keywordCompletions([
  ...EXPRESSION_KEYWORDS,
  ...CLAUSE_KEYWORDS,
]);
const FUNCTION_OPTIONS: Completion[] = COMMON_FUNCTIONS.map((name) =>
  snippetCompletion(`${name}(\${})`, {
    boost: FUNCTION_BOOST,
    label: name,
    type: "function",
  })
);

interface ScopedColumns {
  /** No FROM yet: columns of the default schema's tables, as a guess. */
  fromSchema: readonly { column: CompletionColumn; relation: string }[];
  /** Columns of relations the statement references, with their relation. */
  inScope: readonly { column: CompletionColumn; relation: string }[];
}

function columnOptions(
  entries: ScopedColumns["inScope"],
  boost: number
): Completion[] {
  return entries.map(({ column, relation }) => ({
    boost,
    detail: `${column.type} · ${relation}`,
    label: column.name,
    type: column.isPrimaryKey ? "primary-key" : "column",
  }));
}

/** The options our source contributes for a clause (lang-sql adds tables). */
function contextOptions(
  clause: CompletionClause,
  columns: ScopedColumns
): Completion[] {
  switch (clause) {
    case "statement":
      return STATEMENT_OPTIONS;
    case "relation":
    case "other":
      return RELATION_OPTIONS;
    case "expression":
      return [
        ...columnOptions(columns.inScope, IN_SCOPE_COLUMN_BOOST),
        ...(columns.inScope.length === 0
          ? columnOptions(columns.fromSchema, SCHEMA_COLUMN_BOOST)
          : []),
        ...FUNCTION_OPTIONS,
        ...EXPRESSION_KEYWORD_OPTIONS,
      ];
    default:
      return [];
  }
}

/**
 * Resolves the columns a statement can use: those of the relations it
 * references (FROM/JOIN) when their columns are loaded, otherwise the default
 * schema's tables so a bare `SELECT st` still finds `status`.
 */
function scopedColumns({
  columnsByRelation,
  defaultSchema,
  referenced,
  relations,
}: {
  columnsByRelation: ReadonlyMap<string, readonly CompletionColumn[]>;
  defaultSchema: string;
  referenced: readonly ReferencedRelation[];
  relations: readonly SqlRelation[];
}): ScopedColumns {
  const label = (schema: string, name: string) =>
    schema === defaultSchema ? name : `${schema}.${name}`;
  const inScope = referenced.flatMap((relation) =>
    (columnsByRelation.get(relationKey(relation)) ?? []).map((column) => ({
      column,
      relation: label(relation.schema, relation.name),
    }))
  );
  const fromSchema =
    referenced.length > 0
      ? []
      : relations.flatMap((relation) =>
          relation.schema === defaultSchema
            ? (columnsByRelation.get(relationKey(relation)) ?? []).map(
                (column) => ({ column, relation: relation.name })
              )
            : []
        );
  return { fromSchema, inScope };
}

/**
 * The statement the cursor is in: the text before the cursor (to classify
 * the clause) and the whole statement (FROM may come after the cursor, as in
 * `SELECT st| FROM orders`). Between a `;` and the next statement the cursor
 * starts a new, empty statement.
 */
function statementAround(
  doc: string,
  pos: number
): { before: string; full: string } {
  const statements = splitSqlStatements(doc);
  const containing = statements.find(
    (statement) => pos >= statement.from && pos <= statement.to
  );
  if (containing) {
    return {
      before: doc.slice(containing.from, pos),
      full: containing.text,
    };
  }
  const previous = statements.filter((statement) => statement.to < pos).at(-1);
  const start = previous ? previous.from : 0;
  const terminator = previous ? doc.indexOf(";", previous.to) : -1;
  if (terminator !== -1 && terminator < pos) {
    return { before: doc.slice(terminator + 1, pos), full: "" };
  }
  return { before: doc.slice(start, pos), full: doc.slice(start, pos) };
}

export type { CompletionClause, ScopedColumns };
export { completionClause, contextOptions, scopedColumns, statementAround };
