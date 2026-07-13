import {
  PaginationStrategy,
  type ResponseLimits,
} from "@/protogen/querylane/console/v1alpha1/table_data_pb";
import {
  type RowIdentity,
  RowIdentity_Source,
} from "@/protogen/querylane/console/v1alpha1/table_pb";

type GridStatusTone = "muted" | "warning";
type GridStatusId =
  | "offset-pagination"
  | "no-stable-key"
  | "response-capped"
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
  pageSize: number;
  paginationStrategy: PaginationStrategy;
  rowIdentity?: RowIdentity | undefined;
  rowsReturned: number;
}

function buildGridStatusItems({
  hasNext,
  limits,
  pageSize,
  paginationStrategy,
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

  if (isResponseCapped({ hasNext, limits, pageSize, rowsReturned })) {
    items.push({
      description: buildResponseCappedDescription(limits),
      id: "response-capped",
      label: "Response capped",
      tone: "warning",
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

export type { GridStatusId, GridStatusItem };
export { buildGridStatusItems, hasStableRowIdentity, isResponseCapped };
