import { anyPredicate } from "@/lib/predicates";

interface PostgresArrayItem {
  display: string;
  isNull: boolean;
}

interface KeyedPostgresArrayItem {
  item: PostgresArrayItem;
  key: string;
  position: number;
}

type PostgresArrayParseResult =
  | { items: PostgresArrayItem[]; ok: true }
  | { items?: undefined; ok: false };

interface ArrayScanState {
  buffer: string;
  depth: number;
  inQuotes: boolean;
  items: PostgresArrayItem[];
  itemWasQuoted: boolean;
}

function normalizeArrayItem(
  rawItem: string,
  wasQuoted: boolean
): PostgresArrayItem {
  if (!wasQuoted && rawItem === "NULL") {
    return { display: "NULL", isNull: true };
  }
  return { display: rawItem, isNull: false };
}

function pushArrayItem(state: ArrayScanState) {
  state.items.push(normalizeArrayItem(state.buffer, state.itemWasQuoted));
  state.buffer = "";
  state.itemWasQuoted = false;
}

function consumeEscapedCharacter(
  input: string,
  index: number,
  state: ArrayScanState
): number | undefined {
  if (!(state.inQuotes && input.charAt(index) === "\\")) {
    return;
  }
  const next = input.charAt(index + 1);
  if (next !== "") {
    state.buffer += next;
    return index + 1;
  }
  return index;
}

function consumeQuote(char: string, state: ArrayScanState): boolean {
  if (char !== '"') {
    return false;
  }
  state.inQuotes = !state.inQuotes;
  state.itemWasQuoted = true;
  return true;
}

function updateNestedArrayDepth(char: string, state: ArrayScanState): boolean {
  if (state.inQuotes) {
    return true;
  }
  if (char === "{") {
    state.depth += 1;
    return true;
  }
  if (char !== "}") {
    return true;
  }
  state.depth -= 1;
  return state.depth >= 0;
}

function isArrayItemSeparator(char: string, state: ArrayScanState): boolean {
  return !state.inQuotes && state.depth === 0 && char === ",";
}

function scanArrayItems(inner: string): PostgresArrayParseResult {
  const state: ArrayScanState = {
    buffer: "",
    depth: 0,
    inQuotes: false,
    items: [],
    itemWasQuoted: false,
  };

  for (let index = 0; index < inner.length; index += 1) {
    const escapedIndex = consumeEscapedCharacter(inner, index, state);
    if (escapedIndex !== undefined) {
      index = escapedIndex;
      continue;
    }

    const char = inner.charAt(index);
    if (consumeQuote(char, state)) {
      continue;
    }
    if (!updateNestedArrayDepth(char, state)) {
      return { ok: false };
    }
    if (isArrayItemSeparator(char, state)) {
      pushArrayItem(state);
      continue;
    }
    state.buffer += char;
  }

  if (
    anyPredicate(
      () => state.inQuotes,
      () => state.depth !== 0
    )
  ) {
    return { ok: false };
  }

  pushArrayItem(state);
  return { items: state.items, ok: true };
}

function parsePostgresArrayLiteral(raw: string): PostgresArrayParseResult {
  if (!(raw.startsWith("{") && raw.endsWith("}"))) {
    return { ok: false };
  }

  const inner = raw.slice(1, -1);
  if (inner === "") {
    return { items: [], ok: true };
  }

  return scanArrayItems(inner);
}

function keyPostgresArrayItems(
  items: PostgresArrayItem[]
): KeyedPostgresArrayItem[] {
  const countsByIdentity = new Map<string, number>();
  return items.map((item, zeroBasedPosition) => {
    const identity = `${item.isNull ? "null" : "value"}:${item.display}`;
    const occurrence = countsByIdentity.get(identity) ?? 0;
    countsByIdentity.set(identity, occurrence + 1);
    return {
      item,
      key: `${identity}:${occurrence}`,
      position: zeroBasedPosition + 1,
    };
  });
}

export { keyPostgresArrayItems, parsePostgresArrayLiteral };
