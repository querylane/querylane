interface ListSort {
  desc: boolean;
  id: string;
}
type ListSortValue = string | number | bigint | boolean | null | undefined;

function resolveListColumnOrder(
  order: readonly string[] | undefined,
  available: readonly string[]
): string[] {
  const known = new Set(available);
  return [
    ...new Set([...(order ?? []).filter((id) => known.has(id)), ...available]),
  ];
}

function resolveListSorting(
  sorting: readonly ListSort[],
  available: readonly string[]
): ListSort[] {
  const known = new Set(available);
  const seen = new Set<string>();
  return sorting.filter(({ id }) => {
    if (!known.has(id) || seen.has(id)) {
      return false;
    }
    seen.add(id);
    return true;
  });
}

function listSortDirection(
  id: string,
  sorting: readonly ListSort[]
): "ascending" | "descending" | undefined {
  const current = sorting.find((sort) => sort.id === id);
  if (!current) {
    return undefined;
  }
  return current.desc ? "descending" : "ascending";
}

function isMissing(value: ListSortValue) {
  return (
    value === null ||
    value === undefined ||
    (typeof value === "number" && Number.isNaN(value))
  );
}
function comparePrimitive(
  a: Exclude<ListSortValue, null | undefined>,
  b: Exclude<ListSortValue, null | undefined>
) {
  if (a < b) {
    return -1;
  }
  if (a > b) {
    return 1;
  }
  return 0;
}
function isTimestampParts(
  value: unknown
): value is { seconds: bigint; nanos: number } {
  return (
    typeof value === "object" &&
    value !== null &&
    "seconds" in value &&
    typeof value.seconds === "bigint" &&
    "nanos" in value &&
    typeof value.nanos === "number"
  );
}
function isPrimitiveValue(
  value: unknown
): value is Exclude<ListSortValue, null | undefined> {
  return (
    typeof value === "string" ||
    typeof value === "number" ||
    typeof value === "bigint" ||
    typeof value === "boolean"
  );
}
function compareListCellValues(a: unknown, b: unknown): number {
  if (isTimestampParts(a) && isTimestampParts(b)) {
    return (
      comparePrimitive(a.seconds, b.seconds) ||
      comparePrimitive(a.nanos, b.nanos)
    );
  }
  if (a instanceof Date && b instanceof Date) {
    return comparePrimitive(a.getTime(), b.getTime());
  }
  if (typeof a === "string" && typeof b === "string") {
    return a.localeCompare(b, "en", { numeric: true });
  }
  if (isPrimitiveValue(a) && isPrimitiveValue(b)) {
    return comparePrimitive(a, b);
  }
  return 0;
}
function compareSortValues(
  a: ListSortValue,
  b: ListSortValue,
  descending: boolean
) {
  const missingA = isMissing(a);
  const missingB = isMissing(b);
  if (missingA !== missingB) {
    return missingA ? 1 : -1;
  }
  if (a === undefined || a === null || b === undefined || b === null) {
    return 0;
  }
  const compared =
    typeof a === "string" && typeof b === "string"
      ? a.localeCompare(b, "en", { numeric: true })
      : comparePrimitive(a, b);
  return descending ? -compared : compared;
}

// Raw values, missing values last in both directions, stable ties, no mutation.
function sortListRows<T>(
  rows: readonly T[],
  sorting: readonly ListSort[],
  accessors: Record<string, (row: T) => ListSortValue>
): T[] {
  const comparisons = sorting.flatMap((sort) => {
    const accessor = Object.hasOwn(accessors, sort.id)
      ? accessors[sort.id]
      : undefined;
    return accessor
      ? [(a: T, b: T) => compareSortValues(accessor(a), accessor(b), sort.desc)]
      : [];
  });
  return rows.toSorted((a, b) => {
    for (const compare of comparisons) {
      const result = compare(a, b);
      if (result !== 0) {
        return result;
      }
    }
    return 0;
  });
}

export type { ListSort, ListSortValue };
export {
  compareListCellValues,
  comparePrimitive,
  listSortDirection,
  resolveListColumnOrder,
  resolveListSorting,
  sortListRows,
};
