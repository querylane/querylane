import { create } from "zustand";
import {
  createJSONStorage,
  persist,
  type StateStorage,
} from "zustand/middleware";
import { captureException } from "@/lib/diagnostics";

const ONE_SECOND_MS = 1000;
const ONE_MINUTE_MS = 60_000;
const FIVE_MINUTES_MS = 300_000;
const FIFTEEN_MINUTES_MS = 900_000;
const THIRTY_MINUTES_MS = 1_800_000;
const ONE_HOUR_MS = 3_600_000;
const ONE_DAY_MS = 86_400_000;
const MIN_REFRESH_INTERVAL_MS = ONE_MINUTE_MS;
const MAX_REFRESH_INTERVAL_MS = ONE_DAY_MS;

type RefreshIntervalMs = number | null;

const REFRESH_INTERVAL_OPTIONS = [
  {
    description: "Only refresh when you ask for it.",
    intervalMs: null,
    label: "Never",
    value: "never",
  },
  {
    description: "Fastest supported cadence.",
    intervalMs: ONE_MINUTE_MS,
    label: "Every 1 minute",
    value: String(ONE_MINUTE_MS),
  },
  {
    description: "Keep active data reasonably fresh.",
    intervalMs: FIVE_MINUTES_MS,
    label: "Every 5 minutes",
    value: String(FIVE_MINUTES_MS),
  },
  {
    description: "Lower load for normal browsing.",
    intervalMs: FIFTEEN_MINUTES_MS,
    label: "Every 15 minutes",
    value: String(FIFTEEN_MINUTES_MS),
  },
  {
    description: "Occasional background refresh.",
    intervalMs: THIRTY_MINUTES_MS,
    label: "Every 30 minutes",
    value: String(THIRTY_MINUTES_MS),
  },
  {
    description: "Lightest automatic refresh cadence.",
    intervalMs: ONE_HOUR_MS,
    label: "Every 1 hour",
    value: String(ONE_HOUR_MS),
  },
  {
    description: "Daily background refresh.",
    intervalMs: ONE_DAY_MS,
    label: "Every day",
    value: String(ONE_DAY_MS),
  },
] as const satisfies ReadonlyArray<{
  description: string;
  intervalMs: RefreshIntervalMs;
  label: string;
  value: string;
}>;

interface RefreshSettingsState {
  refreshIntervalMs: RefreshIntervalMs;
  setRefreshIntervalMs: (next: RefreshIntervalMs) => void;
}

type RefreshIntervalParseResult =
  | { errors: string[]; intervalMs?: never; ok: false }
  | { errors?: never; intervalMs: RefreshIntervalMs; ok: true };

const REFRESH_OFF_VALUES = new Set(["manual", "never", "none", "off"]);
const DURATION_INPUT_PATTERN =
  /^(?:every\s+|in\s+)?(?<amount>\d+(?:\.\d+)?|one|two|three|four|five|six|seven|eight|nine|ten|eleven|twelve)\s*(?<unit>milliseconds?|msecs?|ms|seconds?|secs?|s|minutes?|mins?|m|hours?|hrs?|h|days?|d)$/i;
const UNIT_ONLY_DURATION_INPUT_PATTERN =
  /^(?:every|each)\s+(?<unit>seconds?|secs?|s|minutes?|mins?|m|hours?|hrs?|h|days?|d)$/i;
const DURATION_PREFIX_PATTERN = /^(?:every|in)\s+/i;
const NUMBER_WORD_VALUE_OFFSET = 1;
const NUMBER_WORDS: readonly string[] = [
  "one",
  "two",
  "three",
  "four",
  "five",
  "six",
  "seven",
  "eight",
  "nine",
  "ten",
  "eleven",
  "twelve",
];

function isObjectRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null;
}

function isRefreshIntervalMs(value: unknown): value is RefreshIntervalMs {
  return (
    value === null ||
    (typeof value === "number" &&
      Number.isFinite(value) &&
      Number.isInteger(value) &&
      value >= MIN_REFRESH_INTERVAL_MS &&
      value <= MAX_REFRESH_INTERVAL_MS)
  );
}

function normalizeRefreshIntervalMs(value: unknown): RefreshIntervalMs {
  return isRefreshIntervalMs(value) ? value : null;
}

const memoryRefreshSettingsStorage = new Map<string, string>();
const FALLBACK_REFRESH_SETTINGS_STORAGE: StateStorage = {
  getItem: (name) => memoryRefreshSettingsStorage.get(name) ?? null,
  removeItem: (name) => {
    memoryRefreshSettingsStorage.delete(name);
  },
  setItem: (name, value) => {
    memoryRefreshSettingsStorage.set(name, value);
  },
};

function getRefreshSettingsStorage(): StateStorage {
  if (typeof window === "undefined") {
    return FALLBACK_REFRESH_SETTINGS_STORAGE;
  }
  try {
    return window.localStorage || FALLBACK_REFRESH_SETTINGS_STORAGE;
  } catch (error) {
    captureException(error);
    return FALLBACK_REFRESH_SETTINGS_STORAGE;
  }
}

function durationUnitToMs(unit: string): number {
  const normalized = unit.toLowerCase();
  if (
    ["millisecond", "milliseconds", "msec", "msecs", "ms"].includes(normalized)
  ) {
    return 1;
  }
  if (["second", "seconds", "sec", "secs", "s"].includes(normalized)) {
    return ONE_SECOND_MS;
  }
  if (["minute", "minutes", "min", "mins", "m"].includes(normalized)) {
    return ONE_MINUTE_MS;
  }
  if (["hour", "hours", "hr", "hrs", "h"].includes(normalized)) {
    return ONE_HOUR_MS;
  }
  if (["day", "days", "d"].includes(normalized)) {
    return ONE_DAY_MS;
  }
  return 0;
}

function parseDurationAmount(value: string): number {
  const parsed = Number(value);
  if (!Number.isNaN(parsed)) {
    return parsed;
  }
  const wordIndex = NUMBER_WORDS.indexOf(value.toLowerCase());
  return wordIndex < 0 ? Number.NaN : wordIndex + NUMBER_WORD_VALUE_OFFSET;
}

function validateRefreshIntervalMs(
  intervalMs: number
): RefreshIntervalParseResult {
  if (!Number.isFinite(intervalMs) || intervalMs <= 0) {
    return {
      errors: ["Enter a future interval."],
      ok: false,
    };
  }
  const roundedMs = Math.round(intervalMs);
  if (roundedMs < MIN_REFRESH_INTERVAL_MS) {
    return {
      errors: ["Choose an interval of at least 1 minute."],
      ok: false,
    };
  }
  if (roundedMs > MAX_REFRESH_INTERVAL_MS) {
    return {
      errors: ["Choose an interval of 24 hours or less."],
      ok: false,
    };
  }
  return { intervalMs: roundedMs, ok: true };
}

function parseDurationInput(input: string): RefreshIntervalParseResult | null {
  const durationInput = input.replace(DURATION_PREFIX_PATTERN, "");
  const match =
    UNIT_ONLY_DURATION_INPUT_PATTERN.exec(input) ??
    DURATION_INPUT_PATTERN.exec(durationInput);
  const groups = match?.groups;
  if (!groups) {
    return null;
  }
  const amountToken = groups["amount"] ?? "1";
  const unitToken = groups["unit"];
  if (amountToken === undefined || unitToken === undefined) {
    return {
      errors: ["Enter a valid refresh interval."],
      ok: false,
    };
  }
  const amount = parseDurationAmount(amountToken);
  const unitMs = durationUnitToMs(unitToken);
  if (Number.isNaN(amount) || unitMs === 0) {
    return {
      errors: ["Enter a valid refresh interval."],
      ok: false,
    };
  }
  return validateRefreshIntervalMs(amount * unitMs);
}

async function parseChronoInput(
  input: string,
  now: Date
): Promise<RefreshIntervalParseResult | null> {
  const { casual } = await import("chrono-node");
  const parsedDate = casual.parseDate(input, now);
  if (!parsedDate) {
    return null;
  }
  const intervalMs = parsedDate.getTime() - now.getTime();
  const validation = validateRefreshIntervalMs(intervalMs);
  if (!validation.ok) {
    return validation;
  }
  return validateRefreshIntervalMs(
    Math.round(intervalMs / ONE_MINUTE_MS) * ONE_MINUTE_MS
  );
}

async function parseRefreshIntervalInput(
  input: string,
  now = new Date()
): Promise<RefreshIntervalParseResult> {
  const trimmed = input.trim();
  if (trimmed.length === 0) {
    return {
      errors: ["Enter a refresh interval or turn auto refresh off."],
      ok: false,
    };
  }
  const normalized = trimmed.toLowerCase();
  if (REFRESH_OFF_VALUES.has(normalized)) {
    return { intervalMs: null, ok: true };
  }

  const durationResult = parseDurationInput(trimmed);
  if (durationResult) {
    return durationResult;
  }

  const chronoResult = await parseChronoInput(trimmed, now);
  if (chronoResult) {
    return chronoResult;
  }

  return {
    errors: ['Use a natural time like "every 5 minutes" or "in 15 minutes".'],
    ok: false,
  };
}

function refreshValueToIntervalMs(value: string): RefreshIntervalMs {
  if (value === "never") {
    return null;
  }
  const parsed = Number(value);
  return normalizeRefreshIntervalMs(parsed);
}

function refreshIntervalMsToValue(value: RefreshIntervalMs): string {
  return value === null ? "never" : String(value);
}

function pluralizeDurationPart(value: number, unit: string): string {
  return `${value.toLocaleString()} ${unit}${value === 1 ? "" : "s"}`;
}

function formatRefreshDuration(intervalMs: number): string {
  const roundedMs =
    intervalMs >= ONE_HOUR_MS
      ? Math.round(intervalMs / ONE_MINUTE_MS) * ONE_MINUTE_MS
      : Math.round(intervalMs / ONE_SECOND_MS) * ONE_SECOND_MS;
  const units = [
    { label: "day", ms: ONE_DAY_MS },
    { label: "hour", ms: ONE_HOUR_MS },
    { label: "minute", ms: ONE_MINUTE_MS },
    { label: "second", ms: ONE_SECOND_MS },
  ] as const;
  let remainingMs = roundedMs;
  const parts: string[] = [];
  for (const unit of units) {
    if (unit.label === "second" && intervalMs >= ONE_HOUR_MS) {
      continue;
    }
    const value = Math.floor(remainingMs / unit.ms);
    if (value > 0) {
      parts.push(pluralizeDurationPart(value, unit.label));
      remainingMs %= unit.ms;
    }
  }
  return parts.join(" ") || pluralizeDurationPart(1, "second");
}

function formatRefreshIntervalLabel(value: RefreshIntervalMs): string {
  const match = REFRESH_INTERVAL_OPTIONS.find(
    (option) => option.intervalMs === value
  );
  if (match) {
    return match.label;
  }
  if (value === null) {
    return "Never";
  }
  return `Every ${formatRefreshDuration(value)}`;
}

// Why: refresh cadence is a personal local setting and intentionally does not
// sync across already-open tabs. Cross-tab broadcast would reset active pollers
// mid-countdown in surprising ways; a fresh tab still reads the latest stored
// value on load.
const useRefreshSettingsStore = create<RefreshSettingsState>()(
  persist(
    (set) => ({
      refreshIntervalMs: null,
      setRefreshIntervalMs: (next) =>
        set({ refreshIntervalMs: normalizeRefreshIntervalMs(next) }),
    }),
    {
      merge: (persisted, current) => {
        if (!isObjectRecord(persisted)) {
          return current;
        }
        return {
          ...current,
          refreshIntervalMs: normalizeRefreshIntervalMs(
            persisted["refreshIntervalMs"]
          ),
        };
      },
      name: "querylane-refresh-settings",
      partialize: (state) => ({
        refreshIntervalMs: state.refreshIntervalMs,
      }),
      storage: createJSONStorage(getRefreshSettingsStorage),
      version: 1,
    }
  )
);

export type { RefreshIntervalMs, RefreshIntervalParseResult };
export {
  formatRefreshIntervalLabel,
  MAX_REFRESH_INTERVAL_MS,
  MIN_REFRESH_INTERVAL_MS,
  parseRefreshIntervalInput,
  REFRESH_INTERVAL_OPTIONS,
  refreshIntervalMsToValue,
  refreshValueToIntervalMs,
  useRefreshSettingsStore,
};
