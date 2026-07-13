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
  copyable?: boolean;
  sql: string;
  variant?: "block" | "inline";
  wrap?: boolean;
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

function highlightSql(sqlText: string): ThemedTokenWithVariants[][] {
  return SQL_HIGHLIGHTER.codeToTokensWithThemes(sqlText, {
    lang: "sql",
    themes: SQL_THEMES,
    tokenizeTimeLimit: 200,
  });
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

export function SqlCodeBlock({
  className,
  copyable = true,
  sql: sqlText,
  variant = "block",
  wrap = false,
}: SqlCodeBlockProps) {
  const tokenLines = highlightSql(sqlText);
  const inline = variant === "inline";

  return (
    <div className={cn("relative min-w-0 max-w-full", inline && "w-full")}>
      <pre
        className={cn(
          inline
            ? "min-w-0 max-w-full truncate font-mono text-[12px] leading-normal"
            : "min-w-0 max-w-full rounded-md border bg-muted/40 p-3 font-mono text-foreground text-xs leading-relaxed",
          !inline &&
            (wrap
              ? cn(
                  "overflow-x-hidden whitespace-pre-wrap break-words",
                  copyable && "pr-14"
                )
              : cn("overflow-x-auto", copyable && "pr-10")),
          className
        )}
      >
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
      </pre>
      {copyable ? (
        <CopyIconButton
          ariaLabel="Copy SQL"
          className="absolute top-2 right-2"
          value={sqlText}
        />
      ) : null}
    </div>
  );
}
