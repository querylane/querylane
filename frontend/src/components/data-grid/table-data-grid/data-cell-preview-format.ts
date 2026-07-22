type JsonParseResult =
  | { ok: true; value: unknown }
  | { ok: false; value?: undefined };

const JSON_TITLE_MAX_LENGTH = 1000;
/**
 * Minimum display length before a text cell gets the in-cell expand button.
 * Shorter values fit within the capped column width, so the button would only
 * add noise there.
 */
const TEXT_PREVIEW_EXPAND_MIN_LENGTH = 80;
const JSON_PREVIEW_PARSE_MIN_LENGTH = 120;
const JSON_PREVIEW_PARSE_MAX_LENGTH = 50_000;
const JSON_PREVIEW_MAX_LENGTH = 4000;

function truncateForAttribute(value: string, maxLength: number): string {
  if (value.length <= maxLength) {
    return value;
  }
  return `${value.slice(0, maxLength)}…`;
}

function parseJson(raw: string): JsonParseResult {
  try {
    const value: unknown = JSON.parse(raw);
    return { ok: true, value };
  } catch {
    return { ok: false };
  }
}

function formatJsonPreview(raw: string): string {
  const compactRaw = raw.replace(/\s+/g, " ").trim();
  if (raw.length <= JSON_PREVIEW_PARSE_MIN_LENGTH) {
    return compactRaw;
  }
  if (raw.length > JSON_PREVIEW_PARSE_MAX_LENGTH) {
    return truncateForAttribute(compactRaw, JSON_PREVIEW_MAX_LENGTH);
  }

  const parsed = parseJson(raw);
  if (!parsed.ok) {
    return truncateForAttribute(compactRaw, JSON_PREVIEW_MAX_LENGTH);
  }
  return truncateForAttribute(
    JSON.stringify(parsed.value) ?? raw,
    JSON_PREVIEW_MAX_LENGTH
  );
}

function formatPrettyJson(raw: string): string {
  const parsed = parseJson(raw);
  if (!parsed.ok) {
    return raw;
  }
  return JSON.stringify(parsed.value, null, 2) ?? raw;
}

function maybeFormatPrettyJson(raw: string): string | null {
  const parsed = parseJson(raw);
  if (!parsed.ok) {
    return null;
  }
  return JSON.stringify(parsed.value, null, 2) ?? raw;
}

export {
  formatJsonPreview,
  formatPrettyJson,
  JSON_TITLE_MAX_LENGTH,
  maybeFormatPrettyJson,
  TEXT_PREVIEW_EXPAND_MIN_LENGTH,
  truncateForAttribute,
};
