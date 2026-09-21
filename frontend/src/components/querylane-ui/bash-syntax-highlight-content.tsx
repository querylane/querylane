"use client";

import bash from "@shikijs/langs/bash";
import githubDark from "@shikijs/themes/github-dark";
import githubLight from "@shikijs/themes/github-light";
import type { CSSProperties } from "react";
import type { ThemedTokenWithVariants } from "shiki";
import { createHighlighterCoreSync } from "shiki/core";
import { createJavaScriptRegexEngine } from "shiki/engine/javascript";
import styles from "./bash-syntax-highlight-content.module.css";
import { keyedTokenLines } from "./keyed-token-lines";

interface BashSyntaxHighlightProps {
  code: string;
}

type ShikiTokenStyle = CSSProperties & {
  "--querylane-bash-token-dark"?: string | undefined;
  "--querylane-bash-token-light"?: string | undefined;
};

const HIGHLIGHTER = createHighlighterCoreSync({
  engine: createJavaScriptRegexEngine(),
  langs: [bash],
  themes: [githubLight, githubDark],
});
const THEMES = {
  dark: "github-dark",
  light: "github-light",
} as const;
const MAX_CACHED_CODE_SNIPPETS = 500;
const TOKEN_CACHE = new Map<string, ThemedTokenWithVariants[][]>();

function highlightBash(code: string): ThemedTokenWithVariants[][] {
  const cachedTokenLines = TOKEN_CACHE.get(code);
  if (cachedTokenLines) {
    return cachedTokenLines;
  }

  const tokenLines = HIGHLIGHTER.codeToTokensWithThemes(code, {
    lang: "bash",
    themes: THEMES,
    tokenizeTimeLimit: 200,
  });
  if (TOKEN_CACHE.size >= MAX_CACHED_CODE_SNIPPETS) {
    const oldestCacheKey = TOKEN_CACHE.keys().next().value;
    if (oldestCacheKey !== undefined) {
      TOKEN_CACHE.delete(oldestCacheKey);
    }
  }
  TOKEN_CACHE.set(code, tokenLines);
  return tokenLines;
}

function BashSyntaxHighlight({ code }: BashSyntaxHighlightProps) {
  const tokenLines = keyedTokenLines(highlightBash(code));

  return (
    <code
      className="language-bash"
      data-language="bash"
      data-syntax-highlighter="shiki"
    >
      {tokenLines.map((line) => (
        <span data-shiki-line="" key={line.key}>
          {line.tokens.map(({ key, token }) => (
            <span
              className={styles["token"]}
              data-shiki-token=""
              key={key}
              style={
                {
                  "--querylane-bash-token-dark": token.variants["dark"]?.color,
                  "--querylane-bash-token-light":
                    token.variants["light"]?.color,
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

export { BashSyntaxHighlight };
