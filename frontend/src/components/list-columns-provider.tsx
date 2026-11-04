import { useLocation, useNavigate, useSearch } from "@tanstack/react-router";
import type { ReactNode } from "react";
import { ColumnSelectionContext } from "@/lib/list-columns";
import { handleNavigationError } from "@/lib/navigation-errors";

function UrlListColumnsProvider({ children }: { children: ReactNode }) {
  const { columns } = useSearch({ from: "__root__" });
  const pathname = useLocation({ select: (location) => location.pathname });
  const navigate = useNavigate({ from: "/" });
  return (
    <ColumnSelectionContext
      value={{
        selections: columns ?? {},
        setSelection: (key, selection) => {
          navigate({
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
