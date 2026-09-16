"use client";

import bash from "@shikijs/langs/bash";
import githubDark from "@shikijs/themes/github-dark";
import githubLight from "@shikijs/themes/github-light";
import type { CSSProperties } from "react";
import type { ThemedTokenWithVariants } from "shiki";
import { createHighlighterCoreSync } from "shiki/core";
import { createJavaScriptRegexEngine } from "shiki/engine/javascript";

interface BashSyntaxHighlightProps {
  code: string;
}

interface KeyedToken {
  key: string;
  token: ThemedTokenWithVariants;
}

interface KeyedTokenLine {
  key: string;
  tokens: KeyedToken[];
  trailingNewline: boolean;
}

type ShikiTokenStyle = CSSProperties & {
  "--querylane-bash-token-dark"?: string;
  "--querylane-bash-token-light"?: string;
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

function tokenStyle(
  token: ThemedTokenWithVariants
): ShikiTokenStyle | undefined {
  const dark = token.variants["dark"]?.color;
  const light = token.variants["light"]?.color;
  if (!(dark || light)) {
    return;
  }
  const style: ShikiTokenStyle = {};
  if (dark) {
    style["--querylane-bash-token-dark"] = dark;
  }
  if (light) {
    style["--querylane-bash-token-light"] = light;
  }
  return style;
}

function keyedTokenLines(
  tokenLines: ThemedTokenWithVariants[][]
): KeyedTokenLine[] {
  let keyOffset = 0;
  let remainingLines = tokenLines.length;
  return tokenLines.map((line) => {
    const lineStart = keyOffset;
    const tokens = line.map((token) => {
      const tokenStart = keyOffset;
      keyOffset += Math.max(token.content.length, 1);
      return {
        key: `token-${tokenStart}-${keyOffset}`,
        token,
      };
    });
    remainingLines -= 1;
    const keyedLine = {
      key: `line-${lineStart}-${keyOffset}`,
      tokens,
      trailingNewline: remainingLines > 0,
    };
    keyOffset += 1;
    return keyedLine;
  });
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
              className="[color:var(--querylane-bash-token-light,currentColor)] dark:[color:var(--querylane-bash-token-dark,var(--querylane-bash-token-light,currentColor))]"
              data-shiki-token=""
              key={key}
              style={tokenStyle(token)}
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
