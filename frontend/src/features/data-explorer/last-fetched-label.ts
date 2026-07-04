const LAST_FETCHED_TIME_FORMATTER = new Intl.DateTimeFormat(undefined, {
  hour: "numeric",
  minute: "2-digit",
  second: "2-digit",
});

/**
 * Human-readable "Last fetched 10:42:07 AM" label shared by the table data grid
 * and the metadata tabs so every explorer surface phrases freshness the same.
 */
export function formatLastFetchedLabel(dataUpdatedAt: number): string {
  return dataUpdatedAt > 0
    ? `Last fetched ${LAST_FETCHED_TIME_FORMATTER.format(new Date(dataUpdatedAt))}`
    : "Not fetched yet";
}
