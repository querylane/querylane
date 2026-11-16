import { useLocation, useNavigate, useSearch } from "@tanstack/react-router";
import { type ReactNode, useId, useRef } from "react";
import { ColumnSelectionContext } from "@/lib/list-columns";
import type { ListSort } from "@/lib/list-layout";
import { handleNavigationError } from "@/lib/navigation-errors";

function withEntry<T>(
  record: Record<string, T> | undefined,
  key: string,
  value: T | undefined
) {
  const next = new Map(Object.entries(record ?? {}));
  if (value === undefined) {
    next.delete(key);
  } else {
    next.set(key, value);
  }
  return next.size > 0 ? Object.fromEntries(next) : undefined;
}

function UrlListColumnsProvider({ children }: { children: ReactNode }) {
  const ownerId = useId();
  const revisionRef = useRef(0);
  const { columns, columnOrder, listSort } = useSearch({ from: "__root__" });
  const pathname = useLocation({ select: (location) => location.pathname });
  const navigate = useNavigate({ from: "/" });
  function update(
    key: string,
    patch: {
      columns?: string[] | undefined;
      order?: string[] | undefined;
      sorting?: ListSort[] | undefined;
    }
  ) {
    revisionRef.current += 1;
    const marker = `${ownerId}:${revisionRef.current}`;
    navigate({
      hash: true,
      state: (previous) => ({ ...previous, querylaneListColumns: marker }),
      to: pathname,
      replace: true,
      resetScroll: false,
      search: (previous) => ({
        ...previous,
        ...("columns" in patch
          ? {
              columns: withEntry(
                previous.columns,
                key,
                patch.columns?.toSorted()
              ),
            }
          : {}),
        ...("order" in patch
          ? { columnOrder: withEntry(previous.columnOrder, key, patch.order) }
          : {}),
        ...("sorting" in patch
          ? { listSort: withEntry(previous.listSort, key, patch.sorting) }
          : {}),
      }),
    }).catch(handleNavigationError);
  }
  return (
    <ColumnSelectionContext
      value={{
        selections: columns ?? {},
        setSelection: (key, selection) => {
          update(key, { columns: selection });
        },
        layout: {
          orders: columnOrder ?? {},
          sortings: listSort ?? {},
          setOrder: (key, order) => {
            update(key, { order });
          },
          setSorting: (key, sorting) => {
            update(key, { sorting });
          },
          resetColumns: (key) => {
            update(key, { columns: undefined, order: undefined });
          },
        },
      }}
    >
      {children}
    </ColumnSelectionContext>
  );
}

export { UrlListColumnsProvider };
