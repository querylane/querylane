import { useNavigate, useSearch } from "@tanstack/react-router";
import { useEffect, useRef, useState } from "react";
import { handleNavigationError } from "@/lib/navigation-errors";

function normalizeSearchText(value: string): string {
  return value.trim() === "" ? "" : value;
}

type UrlTableSearchRoute =
  | "/instances/$instanceId"
  | "/instances/$instanceId/"
  | "/instances/$instanceId/activity"
  | "/instances/$instanceId/configuration"
  | "/instances/$instanceId/roles"
  | "/instances/$instanceId/roles/"
  | "/instances/$instanceId/databases/$databaseId/extensions";

function useUrlTableSearch(
  from: UrlTableSearchRoute
): [string, (value: string) => Promise<void>] {
  const routeSearchText = useSearch({
    from,
    select: (search) => (typeof search.q === "string" ? search.q : ""),
  });
  const navigate = useNavigate({ from });
  const pendingNavigationRef = useRef<{
    settledRevisionAtStart: number;
    text: string;
  } | null>(null);
  const settledRouteRevisionRef = useRef(0);
  const settledRouteSearchTextRef = useRef(routeSearchText);
  const [draftSearchText, setDraftSearchText] = useState(routeSearchText);

  useEffect(
    function syncDraftFromSettledUrl() {
      settledRouteRevisionRef.current += 1;
      settledRouteSearchTextRef.current = routeSearchText;
      if (pendingNavigationRef.current?.text === routeSearchText) {
        pendingNavigationRef.current = null;
      }
      if (pendingNavigationRef.current !== null) {
        return;
      }
      setDraftSearchText(routeSearchText);
    },
    [routeSearchText]
  );

  function setUrlSearchText(value: string): Promise<void> {
    const nextValue = normalizeSearchText(value);
    const pendingNavigation = {
      settledRevisionAtStart: settledRouteRevisionRef.current,
      text: nextValue,
    };
    pendingNavigationRef.current = pendingNavigation;
    setDraftSearchText(nextValue);

    return navigate({
      hash: true,
      ignoreBlocker: true,
      replace: true,
      resetScroll: false,
      search: (previous) => ({
        ...previous,
        q: nextValue === "" ? undefined : nextValue,
      }),
    })
      .then(() => {
        if (pendingNavigationRef.current === pendingNavigation) {
          pendingNavigationRef.current = null;
          if (
            settledRouteRevisionRef.current !==
            pendingNavigation.settledRevisionAtStart
          ) {
            setDraftSearchText(settledRouteSearchTextRef.current);
          }
        }
      })
      .catch((error: unknown) => {
        handleNavigationError(error, { area: "url-table-search" });
        if (pendingNavigationRef.current === pendingNavigation) {
          pendingNavigationRef.current = null;
          setDraftSearchText(settledRouteSearchTextRef.current);
        }
      });
  }

  return [draftSearchText, setUrlSearchText];
}

export type { UrlTableSearchRoute };
export { normalizeSearchText, useUrlTableSearch };
