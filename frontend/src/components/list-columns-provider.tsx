import { useLocation, useNavigate, useSearch } from "@tanstack/react-router";
import { type ReactNode, useId, useRef } from "react";
import { ColumnSelectionContext } from "@/lib/list-columns";
import { handleNavigationError } from "@/lib/navigation-errors";

function UrlListColumnsProvider({ children }: { children: ReactNode }) {
  const ownerId = useId();
  const revisionRef = useRef(0);
  const { columns } = useSearch({ from: "__root__" });
  const pathname = useLocation({ select: (location) => location.pathname });
  const navigate = useNavigate({ from: "/" });
  return (
    <ColumnSelectionContext
      value={{
        selections: columns ?? {},
        setSelection: (key, selection) => {
          revisionRef.current += 1;
          const marker = `${ownerId}:${revisionRef.current}`;
          navigate({
            hash: true,
            state: (previous) => ({
              ...previous,
              querylaneListColumns: marker,
            }),
            to: pathname,
            replace: true,
            resetScroll: false,
            search: (previous) => {
              const next = Object.fromEntries(
                Object.entries(previous.columns ?? {}).filter(
                  ([tableKey]) => tableKey !== key
                )
              );
              if (selection !== undefined) {
                next[key] = selection.toSorted();
              }
              return {
                ...previous,
                columns: Object.keys(next).length > 0 ? next : undefined,
              };
            },
          }).catch(handleNavigationError);
        },
      }}
    >
      {children}
    </ColumnSelectionContext>
  );
}

export { UrlListColumnsProvider };
