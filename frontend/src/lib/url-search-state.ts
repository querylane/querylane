import { useLocation, useNavigate, useSearch } from "@tanstack/react-router";
import { useEffect, useRef, useState } from "react";
import { handleNavigationError } from "@/lib/navigation-errors";

export function normalizeSearchText(value: string): string {
  return value.trim() === "" ? "" : value;
}

export function useUrlTableSearch(): [
  string,
  (value: string) => Promise<void>,
] {
  const routeSearchText = useSearch({
    select: (search) => (typeof search.q === "string" ? search.q : ""),
    strict: false,
  });
  const navigate = useNavigate();
  const location = useLocation({
    select: ({ hash, pathname, searchStr }) => ({ hash, pathname, searchStr }),
  });
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

    const params = new URLSearchParams(location.searchStr);
    if (nextValue === "") {
      params.delete("q");
    } else {
      params.set("q", nextValue);
    }

    const nextSearch = params.toString();
    const nextHash = location.hash ? `#${location.hash}` : "";

    return navigate({
      href: `${location.pathname}${nextSearch ? `?${nextSearch}` : ""}${nextHash}`,
      ignoreBlocker: true,
      replace: true,
      resetScroll: false,
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
