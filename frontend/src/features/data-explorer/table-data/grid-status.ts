import type { ResponseLimits } from "@/protogen/querylane/console/v1alpha1/table_data_pb";

type GridStatusId = "response-capped";

interface GridStatusItem {
  description: string;
  id: GridStatusId;
  label: string;
}

interface BuildGridStatusItemsArgs {
  hasNext: boolean;
  limits?: ResponseLimits | undefined;
  pageSize: number;
  rowsReturned: number;
}

function buildGridStatusItems({
  hasNext,
  limits,
  pageSize,
  rowsReturned,
}: BuildGridStatusItemsArgs): GridStatusItem[] {
  const items: GridStatusItem[] = [];

  if (isResponseCapped({ hasNext, limits, pageSize, rowsReturned })) {
    items.push({
      description:
        "The server shortened this page because the response size limit was reached. Narrow the table or lower rows per page to see more values.",
      id: "response-capped",
      label: "Response capped",
    });
  }

  return items;
}

function isResponseCapped({
  hasNext,
  limits,
  pageSize,
  rowsReturned,
}: BuildGridStatusItemsArgs): boolean {
  if (hasNext && rowsReturned < pageSize) {
    return true;
  }
  if (!limits || limits.maxResponseBytes <= 0n) {
    return false;
  }
  return limits.effectiveResponseBytes >= limits.maxResponseBytes;
}

export type { GridStatusId, GridStatusItem };
export { buildGridStatusItems, isResponseCapped };
