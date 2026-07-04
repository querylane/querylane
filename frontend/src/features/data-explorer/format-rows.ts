const ROWS_THRESHOLD_THOUSAND = 1000;
const ROWS_THRESHOLD_MILLION = 1_000_000;
const ROWS_THRESHOLD_BILLION = 1_000_000_000;
const ROWS_THRESHOLD_TEN = 10;
const TRAILING_ZERO_DECIMAL = /\.0$/;

export function formatRows(value: number): string {
  if (value < ROWS_THRESHOLD_THOUSAND) {
    return String(value);
  }
  if (value < ROWS_THRESHOLD_MILLION) {
    const v = value / ROWS_THRESHOLD_THOUSAND;
    return `${v.toFixed(v < ROWS_THRESHOLD_TEN ? 1 : 0).replace(TRAILING_ZERO_DECIMAL, "")}k`;
  }
  if (value < ROWS_THRESHOLD_BILLION) {
    const v = value / ROWS_THRESHOLD_MILLION;
    return `${v.toFixed(v < ROWS_THRESHOLD_TEN ? 1 : 0).replace(TRAILING_ZERO_DECIMAL, "")}M`;
  }
  return `${(value / ROWS_THRESHOLD_BILLION).toFixed(1)}B`;
}
