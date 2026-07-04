import { useLocation, useNavigate, useSearch } from "@tanstack/react-router";
import { useEffect, useRef, useState } from "react";

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
  const pendingTextRef = useRef<string | null>(null);
  const [draftSearchText, setDraftSearchText] = useState(routeSearchText);

  useEffect(
    function syncDraftFromSettledUrl() {
      if (pendingTextRef.current === routeSearchText) {
        pendingTextRef.current = null;
      }
      if (pendingTextRef.current !== null) {
        return;
      }
      setDraftSearchText(routeSearchText);
    },
    [routeSearchText]
  );

  function setUrlSearchText(value: string): Promise<void> {
    const nextValue = normalizeSearchText(value);
    pendingTextRef.current = nextValue;
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
      replace: true,
      resetScroll: false,
    }).finally(() => {
      if (pendingTextRef.current === nextValue) {
        pendingTextRef.current = null;
      }
    });
  }

  return [draftSearchText, setUrlSearchText];
}
