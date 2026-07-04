import { useEffect, useState } from "react";

interface PendingFilterState {
  resourceKey: string;
  value: string | undefined;
}

function buildFilterResourceKey(search: {
  category?: string | undefined;
  name?: string | undefined;
  schema?: string | undefined;
}) {
  return `${search.schema ?? ""}\u0000${search.category ?? ""}\u0000${search.name ?? ""}`;
}

function useDebouncedValue<T>(value: T, delayMs: number): T {
  const [debouncedValue, setDebouncedValue] = useState(value);
  useEffect(
    function updateDebouncedValue() {
      const timeoutId = window.setTimeout(() => {
        setDebouncedValue(value);
      }, delayMs);
      return () => window.clearTimeout(timeoutId);
    },
    [delayMs, value]
  );
  return debouncedValue;
}

function useFilterUrlDebounceState({
  delayMs,
  filter,
  resourceKey,
}: {
  delayMs: number;
  filter: string | undefined;
  resourceKey: string;
}) {
  // Pending filter search: updated instantly on every keystroke so the
  // FilterPopover input stays controlled and responsive. The URL and the
  // ReadRows RPC only update after the debounce window settles. It is keyed by
  // resource identity so an unflushed draft from one table cannot attach to the
  // next selected table.
  const [pendingFilter, setPendingFilter] = useState<PendingFilterState>(
    () => ({
      resourceKey,
      value: filter,
    })
  );

  // When the filter param changes externally (back/forward navigation or a
  // different resource being selected), bring the local state back in sync.
  useEffect(
    function syncFilterFromUrl() {
      setPendingFilter({ resourceKey, value: filter });
    },
    [filter, resourceKey]
  );

  const activePendingFilterSearch =
    pendingFilter.resourceKey === resourceKey ? pendingFilter.value : filter;
  const debouncedFilter = useDebouncedValue(pendingFilter, delayMs);

  return {
    activePendingFilterSearch,
    debouncedFilter,
    setPendingFilter,
  };
}

export type { PendingFilterState };
export { buildFilterResourceKey, useDebouncedValue, useFilterUrlDebounceState };
