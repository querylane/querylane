import type { ThemedTokenWithVariants } from "shiki";

import {
  MAX_HIGHLIGHT_LINES,
  MAX_HIGHLIGHT_TOKENS,
} from "./syntax-highlight-policy";

type Language = "bash" | "sql";
interface DisplayToken {
  content: string;
  dark: string | undefined;
  key: number;
  light: string | undefined;
}
interface DisplayLine {
  key: number;
  tokens: DisplayToken[];
}
interface CacheEntry {
  cost: number;
  lines: DisplayLine[];
}

// Shared SQL + Bash retention accounting, not a measured JS heap limit. Count
// UTF-16 key/content/color payload plus conservative object/array allowances.
// Only compact display tokens are retained; grammar state/explanations are not.
const MAX_RETAINED_BYTES = 2_097_152;
const BYTES_PER_CODE_UNIT = 2;
const ENTRY_BYTES = 128;
const LINE_BYTES = 64;
const TOKEN_BYTES = 256;
const cache = new Map<string, CacheEntry>();
let retainedBytes = 0;

function readHighlightTokens(
  language: Language,
  source: string,
  tokenize: () => ThemedTokenWithVariants[][]
): DisplayLine[] | null {
  const key = `${language}:${source}`;
  const cached = cache.get(key);
  if (cached) {
    // LRU: a currently used snippet should outlive unused older snippets.
    cache.delete(key);
    cache.set(key, cached);
    return cached.lines;
  }
  const rawLines = tokenize();
  if (rawLines.length > MAX_HIGHLIGHT_LINES) {
    return null;
  }
  let tokenCount = 0;
  for (const line of rawLines) {
    tokenCount += line.length;
    if (tokenCount > MAX_HIGHLIGHT_TOKENS) {
      return null;
    }
  }
  let cost = ENTRY_BYTES + key.length * BYTES_PER_CODE_UNIT;
  let nextKey = 0;
  const lines = rawLines.map((line) => {
    const lineKey = nextKey;
    nextKey += 1;
    cost += LINE_BYTES;
    const tokens = line.map((token) => {
      const light = token.variants["light"]?.color;
      const dark = token.variants["dark"]?.color;
      cost +=
        TOKEN_BYTES +
        (token.content.length + (light?.length ?? 0) + (dark?.length ?? 0)) *
          BYTES_PER_CODE_UNIT;
      nextKey += 1;
      return { key: nextKey, content: token.content, light, dark };
    });
    return { key: lineKey, tokens };
  });
  if (cost > MAX_RETAINED_BYTES) {
    return lines;
  }
  while (retainedBytes + cost > MAX_RETAINED_BYTES) {
    const oldest = cache.entries().next().value;
    if (!oldest) {
      break;
    }
    cache.delete(oldest[0]);
    retainedBytes -= oldest[1].cost;
  }
  cache.set(key, { cost, lines });
  retainedBytes += cost;
  return lines;
}

function getHighlightTokens(
  language: Language,
  source: string,
  tokenize: () => ThemedTokenWithVariants[][]
) {
  try {
    return {
      lines: readHighlightTokens(language, source, tokenize),
      failed: false,
    };
  } catch {
    // Errors can contain source/credentials: report the degradation locally,
    // never forward tokenizer details to global error handling or telemetry.
    return { lines: null, failed: true };
  }
}

export { getHighlightTokens };
