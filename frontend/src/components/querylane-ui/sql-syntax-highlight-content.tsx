"use client";

import sql from "@shikijs/langs/sql";
import githubDark from "@shikijs/themes/github-dark";
import githubLight from "@shikijs/themes/github-light";
import type { CSSProperties } from "react";
import type { ThemedTokenWithVariants } from "shiki";
import { createHighlighterCoreSync } from "shiki/core";
import { createJavaScriptRegexEngine } from "shiki/engine/javascript";
import { keyedTokenLines } from "./keyed-token-lines";

interface SqlSyntaxHighlightProps {
  sql: string;
}

type ShikiTokenStyle = CSSProperties & {
  "--querylane-sql-token-dark"?: string | undefined;
  "--querylane-sql-token-light"?: string | undefined;
};

let sqlHighlighter: ReturnType<typeof createHighlighterCoreSync> | undefined;

const SQL_THEMES = {
  dark: "github-dark",
  light: "github-light",
} as const;
const MAX_CACHED_SQL_QUERIES = 500;
const SQL_TOKEN_CACHE = new Map<string, ThemedTokenWithVariants[][]>();

function highlightSql(sqlText: string): ThemedTokenWithVariants[][] {
  const cachedTokenLines = SQL_TOKEN_CACHE.get(sqlText);
  if (cachedTokenLines) {
    return cachedTokenLines;
  }

  // Route preloads import SQL-only tabs before their contents are mounted.
  sqlHighlighter ??= createHighlighterCoreSync({
    engine: createJavaScriptRegexEngine(),
    langs: [sql],
    themes: [githubLight, githubDark],
  });
  const tokenLines = sqlHighlighter.codeToTokensWithThemes(sqlText, {
    lang: "sql",
    themes: SQL_THEMES,
    tokenizeTimeLimit: 200,
  });
  if (SQL_TOKEN_CACHE.size >= MAX_CACHED_SQL_QUERIES) {
    const oldestSqlText = SQL_TOKEN_CACHE.keys().next().value;
    if (oldestSqlText !== undefined) {
      SQL_TOKEN_CACHE.delete(oldestSqlText);
    }
  }
  SQL_TOKEN_CACHE.set(sqlText, tokenLines);
  return tokenLines;
}
/** Multiline SQL needs preserved whitespace; nowrap containers support single-line SQL. */
export function SqlSyntaxHighlight({ sql: sqlText }: SqlSyntaxHighlightProps) {
  const tokenLines = keyedTokenLines(highlightSql(sqlText));

  return (
    <code
      className="language-sql"
      data-language="sql"
      data-syntax-highlighter="shiki"
    >
      {tokenLines.map((line) => (
        <span data-shiki-line="" key={line.key}>
          {line.tokens.map(({ key, token }) => (
            <span
              className="syntax-sql-token"
              data-shiki-token=""
              key={key}
              style={
                {
                  "--querylane-sql-token-dark": token.variants["dark"]?.color,
                  "--querylane-sql-token-light": token.variants["light"]?.color,
                } satisfies ShikiTokenStyle
              }
            >
              {token.content}
            </span>
          ))}
          {line.trailingNewline ? "\n" : null}
        </span>
      ))}
    </code>
  );
}
