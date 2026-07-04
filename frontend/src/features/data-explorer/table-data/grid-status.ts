import { type Timestamp, timestampDate } from "@bufbuild/protobuf/wkt";
import {
  PaginationStrategy,
  type ResponseLimits,
  type RowCount,
  RowCount_Status,
} from "@/protogen/querylane/console/v1alpha1/table_data_pb";
import {
  type RowIdentity,
  RowIdentity_Source,
} from "@/protogen/querylane/console/v1alpha1/table_pb";

type GridStatusTone = "info" | "muted" | "warning";
type GridStatusId =
  | "count-estimated"
  | "count-exact"
  | "count-not-requested"
  | "offset-pagination"
  | "no-stable-key"
  | "count-unavailable"
  | "response-capped"
  | "observed-at"
  | "row-actions-limited";

interface GridStatusItem {
  description: string;
  id: GridStatusId;
  label: string;
  tone: GridStatusTone;
}

interface BuildGridStatusItemsArgs {
  hasNext: boolean;
  limits?: ResponseLimits | undefined;
  observedAt?: Timestamp | undefined;
  pageSize: number;
  paginationStrategy: PaginationStrategy;
  rowCount?: RowCount | undefined;
  rowIdentity?: RowIdentity | undefined;
  rowsReturned: number;
}

function buildGridStatusItems({
  hasNext,
  limits,
  observedAt,
  pageSize,
  paginationStrategy,
  rowCount,
  rowIdentity,
  rowsReturned,
}: BuildGridStatusItemsArgs): GridStatusItem[] {
  const items: GridStatusItem[] = [];

  if (paginationStrategy === PaginationStrategy.OFFSET) {
    items.push({
      description:
        "This page uses server-side OFFSET pagination. Large offsets can be slower and concurrent writes can shift rows between pages.",
      id: "offset-pagination",
      label: "Offset pagination",
      tone: "warning",
    });
  }

  if (!hasStableRowIdentity(rowIdentity)) {
    items.push({
      description:
        "The backend did not return primary-key or unique-key row identity. Refresh before trusting row-specific actions after table changes.",
      id: "no-stable-key",
      label: "No stable key",
      tone: "warning",
    });
  }

  const rowCountStatus = buildRowCountStatusItem(rowCount);
  if (rowCountStatus) {
    items.push(rowCountStatus);
  }

  if (isResponseCapped({ hasNext, limits, pageSize, rowsReturned })) {
    items.push({
      description: buildResponseCappedDescription(limits),
      id: "response-capped",
      label: "Response capped",
      tone: "warning",
    });
  }

  const observedAtLabel = observedAt ? formatObservedAt(observedAt) : null;
  if (observedAtLabel) {
    items.push({
      description:
        "Rows and metadata reflect the database snapshot observed at this time.",
      id: "observed-at",
      label: `Observed ${observedAtLabel}`,
      tone: "info",
    });
  }

  if (rowIdentity?.source !== RowIdentity_Source.PRIMARY_KEY) {
    items.push({
      description:
        "Primary-key row identity is unavailable, so update and delete row actions may be disabled or constrained.",
      id: "row-actions-limited",
      label: "Row actions limited; no PK",
      tone: "muted",
    });
  }

  return items;
}

function buildRowCountStatusItem(
  rowCount: RowCount | undefined
): GridStatusItem | null {
  if (!rowCount) {
    return null;
  }

  if (rowCount.status === RowCount_Status.NOT_REQUESTED) {
    return {
      description: "This request did not ask the backend to count rows.",
      id: "count-not-requested",
      label: "Count not requested",
      tone: "muted",
    };
  }

  if (rowCount.status === RowCount_Status.ESTIMATED) {
    return {
      description:
        "Uses PostgreSQL table statistics for a cheap count. Filters are not included in this estimate.",
      id: "count-estimated",
      label: "Estimated count",
      tone: "info",
    };
  }

  if (rowCount.status === RowCount_Status.AVAILABLE) {
    return {
      description:
        "The backend counted matching rows within the row-count limit.",
      id: "count-exact",
      label: "Exact count",
      tone: "info",
    };
  }

  if (rowCount.status === RowCount_Status.UNAVAILABLE) {
    return {
      description:
        "The backend could not provide a row count for this request within limits.",
      id: "count-unavailable",
      label: "Count unavailable",
      tone: "muted",
    };
  }

  return null;
}

function hasStableRowIdentity(rowIdentity: RowIdentity | undefined): boolean {
  return (
    rowIdentity?.source === RowIdentity_Source.PRIMARY_KEY ||
    rowIdentity?.source === RowIdentity_Source.UNIQUE_CONSTRAINT
  );
}

function isResponseCapped({
  hasNext,
  limits,
  pageSize,
  rowsReturned,
}: Pick<
  BuildGridStatusItemsArgs,
  "hasNext" | "limits" | "pageSize" | "rowsReturned"
>): boolean {
  if (hasNext && rowsReturned < pageSize) {
    return true;
  }
  if (!limits || limits.maxResponseBytes <= 0n) {
    return false;
  }
  return limits.effectiveResponseBytes >= limits.maxResponseBytes;
}

function buildResponseCappedDescription(
  _limits: ResponseLimits | undefined
): string {
  return "The server shortened this page because the response size limit was reached. Narrow the table or lower rows per page to see more values.";
}

function formatObservedAt(timestamp: Timestamp): string | null {
  try {
    const observedDate = timestampDate(timestamp);
    if (!Number.isFinite(observedDate.getTime())) {
      return null;
    }
    return new Intl.DateTimeFormat(undefined, {
      dateStyle: "medium",
      timeStyle: "short",
    }).format(observedDate);
  } catch {
    return null;
  }
}

export type { GridStatusId, GridStatusItem };
export { buildGridStatusItems, hasStableRowIdentity, isResponseCapped };
