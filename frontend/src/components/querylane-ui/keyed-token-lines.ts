import type { ThemedTokenWithVariants } from "shiki";

interface KeyedToken {
  key: string;
  token: ThemedTokenWithVariants;
}

interface KeyedTokenLine {
  key: string;
  tokens: KeyedToken[];
  trailingNewline: boolean;
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

export { keyedTokenLines };
