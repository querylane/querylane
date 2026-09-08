/**
 * Splits editor text into individual SQL statements.
 *
 * The backend executes exactly one statement per request, so the workbench
 * has to find statement boundaries itself. The scanner understands the
 * PostgreSQL lexical forms that can legitimately contain a semicolon:
 * standard and escape string literals, quoted identifiers, dollar-quoted
 * strings, line comments and (nested) block comments.
 */

interface SqlStatement {
  /** Offset of the first non-whitespace character of the statement. */
  from: number;
  /** Trimmed statement text without the terminating semicolon. */
  text: string;
  /** Offset just past the last non-whitespace character. */
  to: number;
}

interface TextRange {
  from: number;
  to: number;
}

const DOLLAR_TAG_PATTERN = /^\$([A-Za-z_][A-Za-z0-9_]*)?\$/;
const IDENTIFIER_CHAR_PATTERN = /[A-Za-z0-9_]/;
const TRAILING_SEMICOLON_PATTERN = /;\s*$/;
const WHITESPACE_PATTERN = /\s/;

function skipQuoted(text: string, start: number, quote: string): number {
  let index = start + 1;
  while (index < text.length) {
    if (text.charAt(index) === quote) {
      if (text.charAt(index + 1) === quote) {
        index += 2;
        continue;
      }
      return index + 1;
    }
    index += 1;
  }
  return text.length;
}

function skipEscapeString(text: string, start: number): number {
  // start points at the opening quote of an E'...' literal.
  let index = start + 1;
  while (index < text.length) {
    const char = text.charAt(index);
    if (char === "\\") {
      index += 2;
      continue;
    }
    if (char === "'") {
      if (text.charAt(index + 1) === "'") {
        index += 2;
        continue;
      }
      return index + 1;
    }
    index += 1;
  }
  return text.length;
}

function skipLineComment(text: string, start: number): number {
  const newline = text.indexOf("\n", start);
  return newline === -1 ? text.length : newline + 1;
}

function skipBlockComment(text: string, start: number): number {
  let depth = 1;
  let index = start + 2;
  while (index < text.length && depth > 0) {
    if (text.startsWith("/*", index)) {
      depth += 1;
      index += 2;
      continue;
    }
    if (text.startsWith("*/", index)) {
      depth -= 1;
      index += 2;
      continue;
    }
    index += 1;
  }
  return index;
}

function skipDollarQuoted(text: string, start: number, tag: string): number {
  const end = text.indexOf(tag, start + tag.length);
  return end === -1 ? text.length : end + tag.length;
}

function precededByIdentifierChar(text: string, index: number): boolean {
  return index > 0 && IDENTIFIER_CHAR_PATTERN.test(text.charAt(index - 1));
}

function isEscapeStringStart(text: string, index: number): boolean {
  const char = text.charAt(index);
  if (!(char === "E" || char === "e") || text.charAt(index + 1) !== "'") {
    return false;
  }
  return !precededByIdentifierChar(text, index);
}

function isDollarQuoteStart(text: string, index: number): boolean {
  // `$1` style parameters and identifiers containing `$` are not quotes.
  return text.charAt(index) === "$" && !precededByIdentifierChar(text, index);
}

function isCommentStart(text: string, index: number): "block" | "line" | null {
  const char = text.charAt(index);
  const next = text.charAt(index + 1);
  if (char === "-" && next === "-") {
    return "line";
  }
  if (char === "/" && next === "*") {
    return "block";
  }
  return null;
}

/**
 * Returns the index just past the lexical token starting at `index`, or
 * `null` when the character at `index` is plain statement text.
 */
function skipToken(text: string, index: number): number | null {
  const char = text.charAt(index);
  if (char === "'" || char === '"') {
    return skipQuoted(text, index, char);
  }
  if (isEscapeStringStart(text, index)) {
    return skipEscapeString(text, index + 1);
  }
  const comment = isCommentStart(text, index);
  if (comment === "line") {
    return skipLineComment(text, index);
  }
  if (comment === "block") {
    return skipBlockComment(text, index);
  }
  if (isDollarQuoteStart(text, index)) {
    const match = DOLLAR_TAG_PATTERN.exec(text.slice(index));
    if (match) {
      return skipDollarQuoted(text, index, match[0]);
    }
  }
  return null;
}

function trimmedRange(text: string, range: TextRange): TextRange | null {
  let { from, to } = range;
  while (from < to && WHITESPACE_PATTERN.test(text.charAt(from))) {
    from += 1;
  }
  while (to > from && WHITESPACE_PATTERN.test(text.charAt(to - 1))) {
    to -= 1;
  }
  return from < to ? { from, to } : null;
}

function isCommentOnly(text: string): boolean {
  let index = 0;
  while (index < text.length) {
    if (WHITESPACE_PATTERN.test(text.charAt(index))) {
      index += 1;
      continue;
    }
    const comment = isCommentStart(text, index);
    if (comment === "line") {
      index = skipLineComment(text, index);
      continue;
    }
    if (comment === "block") {
      index = skipBlockComment(text, index);
      continue;
    }
    return false;
  }
  return true;
}

function statementInRange(text: string, range: TextRange): SqlStatement | null {
  const trimmed = trimmedRange(text, range);
  if (!trimmed) {
    return null;
  }
  const statementText = text.slice(trimmed.from, trimmed.to);
  if (isCommentOnly(statementText)) {
    return null;
  }
  return { from: trimmed.from, text: statementText, to: trimmed.to };
}

/** Splits `text` into statements at top-level semicolons. */
function splitSqlStatements(text: string): SqlStatement[] {
  const statements: SqlStatement[] = [];
  let statementStart = 0;
  let index = 0;
  const pushRange = (to: number) => {
    const statement = statementInRange(text, { from: statementStart, to });
    if (statement) {
      statements.push(statement);
    }
  };
  while (index < text.length) {
    const next = skipToken(text, index);
    if (next !== null) {
      index = next;
      continue;
    }
    if (text.charAt(index) === ";") {
      pushRange(index);
      statementStart = index + 1;
    }
    index += 1;
  }
  pushRange(text.length);
  return statements;
}

/**
 * Picks the statement the cursor is "in": the one whose range contains the
 * cursor, else the closest statement before it, else the first one.
 */
function statementAtCursor(
  statements: readonly SqlStatement[],
  cursor: number
): SqlStatement | undefined {
  let candidate: SqlStatement | undefined;
  for (const statement of statements) {
    if (cursor >= statement.from && cursor <= statement.to) {
      return statement;
    }
    if (statement.to < cursor) {
      candidate = statement;
    } else {
      break;
    }
  }
  return candidate ?? statements[0];
}

/**
 * Resolves what "run" should execute: the trimmed selection when there is one,
 * otherwise the statement at the cursor. Returns `null` when there is nothing
 * runnable.
 */
function resolveRunnableStatement({
  cursor,
  selection,
  text,
}: {
  cursor: number;
  selection?: TextRange | undefined;
  text: string;
}): SqlStatement | null {
  if (selection && selection.from !== selection.to) {
    const statement = statementInRange(text, selection);
    return statement
      ? {
          ...statement,
          text: statement.text.replace(TRAILING_SEMICOLON_PATTERN, ""),
        }
      : null;
  }
  return statementAtCursor(splitSqlStatements(text), cursor) ?? null;
}

export type { SqlStatement };
export { resolveRunnableStatement, splitSqlStatements, statementAtCursor };
