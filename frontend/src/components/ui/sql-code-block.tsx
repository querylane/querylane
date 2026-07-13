"use client";

import sql from "@shikijs/langs/sql";
import githubDark from "@shikijs/themes/github-dark";
import githubLight from "@shikijs/themes/github-light";
import type { CSSProperties } from "react";
import type { ThemedTokenWithVariants } from "shiki";
import { createHighlighterCoreSync } from "shiki/core";
import { createJavaScriptRegexEngine } from "shiki/engine/javascript";
import { CopyIconButton } from "@/components/ui/copy-icon-button";
import { cn } from "@/lib/utils";

type SqlCodeBlockProps = {
  className?: string;
  copyButtonClassName?: string;
  copyable?: boolean;
  sql: string;
  variant?: "block" | "compact" | "inline";
  wrap?: boolean;
};

type SqlSyntaxHighlightProps = {
  sql: string;
};

type ShikiTokenStyle = CSSProperties & {
  "--querylane-sql-token-dark"?: string;
  "--querylane-sql-token-light"?: string;
};

const SQL_HIGHLIGHTER = createHighlighterCoreSync({
  engine: createJavaScriptRegexEngine(),
  langs: [sql],
  themes: [githubLight, githubDark],
});

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

  const tokenLines = SQL_HIGHLIGHTER.codeToTokensWithThemes(sqlText, {
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

function tokenStyle(token: ThemedTokenWithVariants): ShikiTokenStyle | undefined {
  const dark = token.variants["dark"]?.color;
  const light = token.variants["light"]?.color;
  if (!(dark || light)) {
    return undefined;
  }
  const style: ShikiTokenStyle = {};
  if (dark) {
    style["--querylane-sql-token-dark"] = dark;
  }
  if (light) {
    style["--querylane-sql-token-light"] = light;
  }
  return style;
}

/** Multiline SQL needs preserved whitespace; nowrap containers support single-line SQL. */
export function SqlSyntaxHighlight({ sql: sqlText }: SqlSyntaxHighlightProps) {
  const tokenLines = highlightSql(sqlText);

  return (
    <code
      className="language-sql"
      data-language="sql"
      data-syntax-highlighter="shiki"
    >
      {tokenLines.map((line, lineIndex) => (
        <span data-shiki-line="" key={`line-${lineIndex}`}>
          {line.map((token, tokenIndex) => (
            <span
              className="[color:var(--querylane-sql-token-light,currentColor)] dark:[color:var(--querylane-sql-token-dark,var(--querylane-sql-token-light,currentColor))]"
              data-shiki-token=""
              key={`token-${lineIndex}-${tokenIndex}`}
              style={tokenStyle(token)}
            >
              {token.content}
            </span>
          ))}
          {lineIndex < tokenLines.length - 1 ? "\n" : null}
        </span>
      ))}
    </code>
  );
}

export function SqlCodeBlock({
  className,
  copyButtonClassName,
  copyable = true,
  sql: sqlText,
  variant = "block",
  wrap = false,
}: SqlCodeBlockProps) {
  const compact = variant === "compact";
  const inline = variant === "inline";

  return (
    <div className={cn("relative min-w-0 max-w-full", inline && "w-full")}>
      <pre
        className={cn(
          inline
            ? "min-w-0 max-w-full truncate font-mono text-[12px] leading-normal"
            : cn(
                "min-w-0 max-w-full rounded-md font-mono text-foreground text-xs leading-relaxed",
                compact
                  ? "overflow-x-auto whitespace-pre-wrap break-words border-0 bg-muted/55 px-3 py-2"
                  : "border bg-muted/40 p-3"
              ),
          !inline &&
            !compact &&
            (wrap
              ? cn(
                  "overflow-x-hidden whitespace-pre-wrap break-words",
                  copyable && "pr-14"
                )
              : cn("overflow-x-auto", copyable && "pr-10")),
          compact && copyable && "pr-10",
          className
        )}
      >
        <SqlSyntaxHighlight sql={sqlText} />
      </pre>
      {copyable ? (
        <CopyIconButton
          ariaLabel="Copy SQL"
          className={cn("absolute top-2 right-2", copyButtonClassName)}
          value={sqlText}
        />
      ) : null}
    </div>
  );
}
