const ROW_LIMIT_100 = 100;
const ROW_LIMIT_500 = 500;
const ROW_LIMIT_1000 = 1000;
const ROW_LIMIT_5000 = 5000;
/** Matches the server-side cap on `ExecuteQueryRequest.row_limit`. */
const ROW_LIMIT_10000 = 10_000;

const ROW_LIMIT_OPTIONS = [
  ROW_LIMIT_100,
  ROW_LIMIT_500,
  ROW_LIMIT_1000,
  ROW_LIMIT_5000,
  ROW_LIMIT_10000,
] as const;

type RowLimit = (typeof ROW_LIMIT_OPTIONS)[number];

const DEFAULT_ROW_LIMIT: RowLimit = ROW_LIMIT_1000;

function isRowLimit(value: number): value is RowLimit {
  return (ROW_LIMIT_OPTIONS as readonly number[]).includes(value);
}

export type { RowLimit };
export { DEFAULT_ROW_LIMIT, isRowLimit, ROW_LIMIT_OPTIONS };
