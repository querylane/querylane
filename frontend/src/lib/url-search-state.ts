import {
  useLocation,
  useNavigate,
  useRouter,
  useSearch,
} from "@tanstack/react-router";
import type { SortingState } from "@tanstack/react-table";
import { useEffect, useId, useRef, useState } from "react";
import { useListSorting } from "@/lib/list-columns";
import {
  databasesSortSchema,
  metadataSortColumns,
  metadataSorting,
  metadataSortParam,
  rolesSortSchema,
} from "@/lib/metadata-table-search";
import {
  handleNavigationError,
  handleNavigationResult,
} from "@/lib/navigation-errors";

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

const URL_SEARCH_DEBOUNCE_MS = 200;
const TRAILING_SLASHES = /\/+$/u;

interface SearchPublication {
  cancelled: boolean;
  promise: Promise<void>;
  resolve: () => void;
  revision: number;
  text: string;
}

function cancelQueued(
  timerRef: { current: ReturnType<typeof setTimeout> | undefined },
  queuedRef: { current: SearchPublication | null }
) {
  clearTimeout(timerRef.current);
  timerRef.current = undefined;
  if (queuedRef.current) {
    queuedRef.current.cancelled = true;
    queuedRef.current.resolve();
  }
  queuedRef.current = null;
}

function tableSearchMarker(state: object): unknown {
  return "querylaneTableSearch" in state
    ? state.querylaneTableSearch
    : undefined;
}
function listColumnsMarker(state: object): unknown {
  return "querylaneListColumns" in state
    ? state.querylaneListColumns
    : undefined;
}
function isListColumnsPublication(
  action: string | undefined,
  locations: {
    current: ReturnType<typeof useLocation>;
    previous: ReturnType<typeof useLocation>;
  },
  texts: { current: string; settled: string }
) {
  const { current, previous } = locations;
  const marker = listColumnsMarker(current.state);
  return (
    action === "REPLACE" &&
    typeof marker === "string" &&
    marker !== listColumnsMarker(previous.state) &&
    current.pathname === previous.pathname &&
    texts.current === texts.settled
  );
}

function useUrlTableSearch(
  from: UrlTableSearchRoute,
  { debounce = false }: { debounce?: boolean } = {}
): [string, (value: string) => Promise<void>, () => Promise<boolean>] {
  const routeSearchText = useSearch({
    from,
    select: (search) => (typeof search.q === "string" ? search.q : ""),
  });
  const location = useLocation();
  const router = useRouter();
  const navigate = useNavigate({ from });
  const ownerId = useId();
  const revisionRef = useRef(0);
  const timerRef = useRef<ReturnType<typeof setTimeout> | undefined>(undefined);
  const queuedRef = useRef<SearchPublication | null>(null);
  const runningRef = useRef<SearchPublication | null>(null);
  const publicationsRef = useRef(new Set<SearchPublication>());
  const ownLocationsRef = useRef(new Set<string>());
  const settledTextRef = useRef(routeSearchText);
  const mountedRef = useRef(true);
  const previousLocationRef = useRef(location);
  const historyActionRef = useRef<string | undefined>(undefined);
  useEffect(
    function observeHistoryAction() {
      return router.history.subscribe(({ action }) => {
        historyActionRef.current = action.type;
      });
    },
    [router]
  );
  const [draftSearchText, setDraftSearchText] = useState(routeSearchText);

  useEffect(
    function syncDraftFromUrl() {
      const text =
        typeof location.search.q === "string" ? location.search.q : "";
      const previousLocation = previousLocationRef.current;
      previousLocationRef.current = location;
      const isColumnPublication = isListColumnsPublication(
        historyActionRef.current,
        { current: location, previous: previousLocation },
        { current: text, settled: settledTextRef.current }
      );
      settledTextRef.current = text;
      if (isColumnPublication) {
        return;
      }
      const marker = tableSearchMarker(location.state);
      if (
        typeof marker === "string" &&
        ownLocationsRef.current.delete(marker)
      ) {
        return;
      }
      revisionRef.current += 1;
      cancelQueued(timerRef, queuedRef);
      for (const publication of publicationsRef.current) {
        publication.cancelled = true;
        publication.resolve();
      }
      publicationsRef.current.clear();
      runningRef.current = null;
      setDraftSearchText(text);
    },
    [location]
  );

  useEffect(function disposeSearchPublication() {
    mountedRef.current = true;
    const ownLocations = ownLocationsRef.current;
    const publications = publicationsRef.current;
    return () => {
      mountedRef.current = false;
      revisionRef.current += 1;
      cancelQueued(timerRef, queuedRef);
      for (const publication of publications) {
        publication.cancelled = true;
        publication.resolve();
      }
      publications.clear();
      runningRef.current = null;
      ownLocations.clear();
    };
  }, []);

  function rollbackPublication(
    error: unknown,
    publication: SearchPublication,
    marker: string
  ) {
    publication.cancelled = true;
    handleNavigationError(error, { area: "url-table-search" });
    ownLocationsRef.current.delete(marker);
    if (mountedRef.current && revisionRef.current === publication.revision) {
      setDraftSearchText(settledTextRef.current);
    }
  }

  function publicationReady(publication?: SearchPublication): Promise<boolean> {
    const revision = revisionRef.current;
    const { href } = router.state.location;
    return (publication?.promise ?? Promise.resolve()).then(() => {
      const current = router.state.location;
      const marker: unknown =
        "querylaneTableSearch" in current.state
          ? current.state.querylaneTableSearch
          : undefined;
      return (
        mountedRef.current &&
        revision === revisionRef.current &&
        current.pathname.replace(TRAILING_SLASHES, "") ===
          location.pathname.replace(TRAILING_SLASHES, "") &&
        (publication
          ? !publication.cancelled &&
            publication.revision === revisionRef.current &&
            marker === `${ownerId}:${publication.revision}`
          : current.href === href)
      );
    });
  }

  function flush(): Promise<boolean> {
    clearTimeout(timerRef.current);
    timerRef.current = undefined;
    const publication = queuedRef.current;
    if (!publication) {
      return publicationReady(runningRef.current ?? undefined);
    }
    queuedRef.current = null;
    runningRef.current = publication;
    publicationsRef.current.add(publication);
    const marker = `${ownerId}:${publication.revision}`;
    ownLocationsRef.current.add(marker);
    async function publishSearch(currentPublication: SearchPublication) {
      try {
        await navigate({
          hash: true,
          ignoreBlocker: true,
          replace: true,
          resetScroll: false,
          state: (previous) => ({ ...previous, querylaneTableSearch: marker }),
          search: (previous) => ({
            ...previous,
            q:
              currentPublication.text === ""
                ? undefined
                : currentPublication.text,
          }),
        });
      } catch (error: unknown) {
        rollbackPublication(error, currentPublication, marker);
      } finally {
        if (runningRef.current === currentPublication) {
          runningRef.current = null;
        }
        publicationsRef.current.delete(currentPublication);
        currentPublication.resolve();
      }
    }
    handleNavigationResult(publishSearch(publication), {
      area: "url-table-search",
    });
    return publicationReady(publication);
  }

  function setUrlSearchText(value: string): Promise<void> {
    cancelQueued(timerRef, queuedRef);
    const text = normalizeSearchText(value);
    revisionRef.current += 1;
    setDraftSearchText(text);
    const { promise, resolve } = Promise.withResolvers<void>();
    queuedRef.current = {
      cancelled: false,
      text,
      promise,
      resolve,
      revision: revisionRef.current,
    };
    if (text === "" || !debounce) {
      handleNavigationResult(flush(), { area: "url-table-search" });
    } else {
      timerRef.current = setTimeout(() => {
        handleNavigationResult(flush(), { area: "url-table-search" });
      }, URL_SEARCH_DEBOUNCE_MS);
    }
    return promise;
  }

  return [draftSearchText, setUrlSearchText, flush];
}

function useUrlTableSorting(
  from: UrlTableSearchRoute,
  kind: "databases" | "roles"
): [SortingState, (value: SortingState) => void] {
  const sort = useSearch({ from, select: (search) => search.sort });
  const navigate = useNavigate({ from });
  const schema = kind === "roles" ? rolesSortSchema : databasesSortSchema;
  const { sorting: layoutSorting } = useListSorting(
    kind === "roles" ? "instance-roles" : "instance-databases",
    metadataSortColumns(kind),
    metadataSorting(undefined, kind === "roles" ? "roleName" : undefined)
  );
  const parsed = schema.parse(sort);
  const sorting =
    parsed === undefined ? layoutSorting : metadataSorting(parsed);
  function setSorting(value: SortingState) {
    navigate({
      hash: true,
      ignoreBlocker: true,
      replace: true,
      resetScroll: false,
      search: (previous) => ({
        ...previous,
        sort: schema.parse(metadataSortParam(value)),
      }),
    }).catch((error: unknown) => {
      handleNavigationError(error, { area: "url-table-sorting" });
    });
  }
  return [sorting, setSorting];
}

export type { UrlTableSearchRoute };
export { useUrlTableSearch, useUrlTableSorting };
