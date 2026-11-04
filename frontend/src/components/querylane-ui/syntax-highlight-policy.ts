/** Input limit in JavaScript UTF-16 code units, not UTF-8 bytes. */
const MAX_HIGHLIGHT_CODE_UNITS = 65_536;
const MAX_HIGHLIGHT_LINES = 4096;
const MAX_HIGHLIGHT_TOKENS = 8192;

function canHighlightSource(source: string) {
  if (source.length > MAX_HIGHLIGHT_CODE_UNITS) {
    return false;
  }
  let lines = 1;
  for (const character of source) {
    if (character === "\n") {
      lines += 1;
      if (lines > MAX_HIGHLIGHT_LINES) {
        return false;
      }
    }
  }
  return true;
}

export { canHighlightSource, MAX_HIGHLIGHT_LINES, MAX_HIGHLIGHT_TOKENS };
