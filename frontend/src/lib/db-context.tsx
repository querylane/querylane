"use client";

import { useLocation, useNavigate } from "@tanstack/react-router";
import React, { use } from "react";
import {
  databasesForInstanceQueryInput,
  useGetDatabaseQuery,
  useListAllDatabasesQuery,
} from "@/hooks/api/database";
import {
  DEFAULT_ALL_INSTANCES_QUERY_INPUT,
  useGetInstanceQuery,
  useListAllInstancesQuery,
} from "@/hooks/api/instance";
import type { AdminPageId } from "@/lib/admin-page";
import { resolveCurrentAdminPage } from "@/lib/admin-page";
import { buildDatabaseName, buildInstanceName } from "@/lib/console-resources";
import {
  type RouteSelectionIds,
  resolveScopeLevel,
  type ScopeLevel,
  useNavigationCallbacks,
} from "@/lib/db-navigation";
import {
  arePersistedSelectionsEqual,
  type PersistedNavigationSelection,
  type PersistedNavigationSelectionStore,
  readPersistedNavigationSelectionStore,
  writePersistedNavigationSelectionStore,
} from "@/lib/db-persistence";
import { buildResourceCollectionQueryState } from "@/lib/db-query-state";
import {
  createFallbackDatabase,
  mapDatabase,
  mapInstance,
  type PostgresDatabase,
  type PostgresInstance,
  type ResourceCollectionQueryState,
} from "@/lib/db-resource-mappers";
import {
  pickSelectedResource,
  resolveSelectedResource,
  resolveValidSelectionId,
  shouldEnableDatabaseSelectionQuery,
} from "@/lib/db-selection-utils";
import { useCurrentRouteIds } from "@/lib/route-ids";
import { isAppDatabaseUnavailableError } from "@/lib/ui-error";

const EMPTY_DB_ARRAY: PostgresDatabase[] = [];
const EMPTY_INSTANCE_ARRAY: PostgresInstance[] = [];

interface DbContextType {
  databases: PostgresDatabase[];
  instances: PostgresInstance[];
  navigateToDatabase: (
    database: PostgresDatabase,
    options?: { overridePage?: AdminPageId }
  ) => void;
  navigateToInstance: (instance: PostgresInstance) => void;
  navigationIds: RouteSelectionIds;
  queryStates: {
    databases: ResourceCollectionQueryState;
    instances: ResourceCollectionQueryState;
  };
  retryInstanceCatalog: () => Promise<void>;
  scopeLevel: ScopeLevel;
  selectedDatabase: PostgresDatabase | null;
  selectedInstance: PostgresInstance | null;
  viewLevel: ScopeLevel;
  viewOverview: (level: "instance" | "database") => void;
}

const DbContext = React.createContext<DbContextType | null>(null);

function useDb() {
  const context = use(DbContext);
  if (!context) {
    throw new Error("useDb must be used within a DbProvider");
  }
  return context;
}

function useSelectedInstanceResource({
  effectiveInstanceId,
  instances,
  routeInstanceId,
}: {
  effectiveInstanceId?: string | undefined;
  instances: PostgresInstance[];
  routeInstanceId?: string | undefined;
}) {
  const selectedInstanceQuery = useGetInstanceQuery(
    routeInstanceId ? { name: buildInstanceName(routeInstanceId) } : undefined,
    {
      enabled: Boolean(routeInstanceId),
      refetchOnReconnect: true,
    }
  );
  const queryUnavailable = isAppDatabaseUnavailableError(
    selectedInstanceQuery.error
  );
  const queryInstance = queryUnavailable
    ? null
    : selectedInstanceQuery.data?.instance;

  let selectedInstance: PostgresInstance | null;
  if (queryUnavailable) {
    selectedInstance = null;
  } else if (queryInstance) {
    selectedInstance = mapInstance(queryInstance);
  } else {
    selectedInstance = pickSelectedResource(instances, effectiveInstanceId);
  }

  return {
    selectedInstance,
    selectedInstanceQuery,
  };
}

function useSelectedDatabase({
  databases,
  effectiveDatabaseId,
  effectiveInstanceId,
  hydrateSelectedDatabaseFromQuery,
  selectedInstanceResolved,
}: {
  databases: PostgresDatabase[];
  effectiveDatabaseId?: string | undefined;
  effectiveInstanceId?: string | undefined;
  hydrateSelectedDatabaseFromQuery: boolean;
  selectedInstanceResolved: boolean;
}): PostgresDatabase | null {
  const databaseQueryEnabled = shouldEnableDatabaseSelectionQuery({
    effectiveDatabaseId,
    effectiveInstanceId,
    hydrateSelectedDatabaseFromQuery,
  });
  const selectedDatabaseQuery = useGetDatabaseQuery(
    effectiveInstanceId && effectiveDatabaseId
      ? {
          name: buildDatabaseName(effectiveInstanceId, effectiveDatabaseId),
        }
      : undefined,
    {
      enabled: databaseQueryEnabled,
    }
  );

  const queryDatabase = selectedDatabaseQuery.data?.database;
  const databaseFallback =
    !databaseQueryEnabled &&
    selectedInstanceResolved &&
    effectiveInstanceId &&
    effectiveDatabaseId
      ? createFallbackDatabase(effectiveInstanceId, effectiveDatabaseId)
      : null;
  const selectedDatabase = resolveSelectedResource({
    fallbackItem: databaseFallback,
    items: databases,
    queryItem: queryDatabase ? mapDatabase(queryDatabase) : null,
    selectedId: effectiveDatabaseId,
  });

  return selectedDatabase;
}

// With no database in the URL or persisted selection, default to the first
// non-system database (falling back to the first overall) so the database nav
// and switcher are reachable. Otherwise the only way to pick a database is the
// switcher, which itself renders only once a database is selected — a dead end
// on a freshly opened instance.
function resolveDatabaseCandidate(
  routeDatabaseId: string | undefined,
  persistedDatabaseId: string | undefined,
  databases: PostgresDatabase[]
): string | undefined {
  return (
    routeDatabaseId ??
    persistedDatabaseId ??
    databases.find((database) => !database.isSystemDatabase)?.id ??
    databases[0]?.id
  );
}

// Only hydrate the selected database via GetDatabase when it isn't already
// resolvable from the loaded list (e.g. a stale persisted id). A route db is
// hydrated by its own loader; an auto-selected or persisted db that's in the
// list needs no extra fetch — avoids a redundant GetDatabase on the instance
// overview (which also tripped the e2e unmocked-RPC guard).
function shouldHydrateSelectedDatabase(
  routeDatabaseId: string | undefined,
  effectiveDatabaseId: string | undefined,
  databases: PostgresDatabase[]
): boolean {
  if (routeDatabaseId || !effectiveDatabaseId) {
    return false;
  }
  return !databases.some((database) => database.id === effectiveDatabaseId);
}

function useDbProviderValue() {
  const navigate = useNavigate();
  const location = useLocation({
    select: (current) => ({
      pathname: current.pathname,
      search: current.search,
    }),
  });
  const routeIds = useCurrentRouteIds();
  const viewLevel = resolveScopeLevel(routeIds);
  const currentPage = resolveCurrentAdminPage({
    pathname: location.pathname,
    scope: viewLevel,
    value: location.search.page,
  });
  const [
    persistedNavigationSelectionStore,
    setPersistedNavigationSelectionStore,
  ] = React.useState<PersistedNavigationSelectionStore>(() =>
    readPersistedNavigationSelectionStore()
  );
  const persistSelection = (ids: RouteSelectionIds) => {
    if (!ids.instanceId) {
      return;
    }

    const nextSelection: PersistedNavigationSelection = {
      databaseId: ids.databaseId,
    };

    const instanceKey = ids.instanceId;
    setPersistedNavigationSelectionStore((previous) => {
      const currentSelection = previous[instanceKey] ?? {};
      if (arePersistedSelectionsEqual(currentSelection, nextSelection)) {
        return previous;
      }

      const nextStore = {
        ...previous,
        [instanceKey]: nextSelection,
      };
      writePersistedNavigationSelectionStore(nextStore);
      return nextStore;
    });
  };

  const instancesQuery = useListAllInstancesQuery(
    DEFAULT_ALL_INSTANCES_QUERY_INPUT,
    {
      refetchOnReconnect: true,
    }
  );
  const instancesUnavailable = isAppDatabaseUnavailableError(
    instancesQuery.error
  );
  const instances = instancesUnavailable
    ? EMPTY_INSTANCE_ARRAY
    : (instancesQuery.data?.instances.map(mapInstance) ?? EMPTY_INSTANCE_ARRAY);

  const routeInstanceId = routeIds.instanceId;
  const effectiveInstanceId = resolveValidSelectionId({
    candidateId: routeInstanceId,
    items: instances,
    loaded: !instancesQuery.isPending,
  });
  const { selectedInstance, selectedInstanceQuery } =
    useSelectedInstanceResource({
      effectiveInstanceId,
      instances,
      routeInstanceId,
    });
  const persistedSelection =
    routeInstanceId && persistedNavigationSelectionStore[routeInstanceId]
      ? persistedNavigationSelectionStore[routeInstanceId]
      : {};
  const selectedInstanceStatus = selectedInstance?.status;
  const selectedInstanceResolved = Boolean(
    selectedInstance || !routeInstanceId || !selectedInstanceQuery.isPending
  );
  const suppressChildAutoQueries = Boolean(
    selectedInstanceResolved && selectedInstanceStatus !== "connected"
  );
  const suppressDatabasesQuery = Boolean(
    effectiveInstanceId && suppressChildAutoQueries
  );
  const databasesQueryEnabled = Boolean(
    effectiveInstanceId && selectedInstanceStatus === "connected"
  );
  const databasesQuery = useListAllDatabasesQuery(
    effectiveInstanceId
      ? databasesForInstanceQueryInput(effectiveInstanceId)
      : undefined,
    {
      enabled: databasesQueryEnabled,
    }
  );
  const databases =
    databasesQuery.data?.databases.map(mapDatabase) ?? EMPTY_DB_ARRAY;

  const databaseCandidate = resolveDatabaseCandidate(
    routeIds.databaseId,
    persistedSelection.databaseId,
    databases
  );
  const effectiveDatabaseId = effectiveInstanceId
    ? resolveValidSelectionId({
        candidateId: databaseCandidate,
        items: databases,
        loaded: databasesQueryEnabled ? !databasesQuery.isPending : false,
      })
    : undefined;

  const effectiveIds: RouteSelectionIds = {
    databaseId: effectiveDatabaseId,
    instanceId: effectiveInstanceId,
  };
  const persistSelectionRef = React.useRef(persistSelection);
  // allow-useEffect: keep ref in sync with latest persistSelection
  React.useEffect(function syncPersistSelectionRef() {
    persistSelectionRef.current = persistSelection;
  });
  // allow-useEffect: persist selection to URL on change
  React.useEffect(
    function persistEffectiveSelection() {
      persistSelectionRef.current({
        databaseId: effectiveDatabaseId,
        instanceId: effectiveInstanceId,
      });
    },
    [effectiveDatabaseId, effectiveInstanceId]
  );
  const queryStates = {
    databases: buildResourceCollectionQueryState({
      enabled: databasesQueryEnabled,
      error: databasesQuery.error,
      isFetching: databasesQuery.isFetching,
      isPending: databasesQuery.isPending,
      items: databases,
      suppressedReason: suppressDatabasesQuery
        ? "instance-not-connected"
        : null,
    }),
    instances: buildResourceCollectionQueryState({
      enabled: true,
      error: instancesQuery.error,
      isFetching: instancesQuery.isFetching,
      isPending: instancesQuery.isPending,
      items: instances,
    }),
  };

  const selectedDatabase = useSelectedDatabase({
    databases,
    effectiveDatabaseId,
    effectiveInstanceId,
    hydrateSelectedDatabaseFromQuery: shouldHydrateSelectedDatabase(
      routeIds.databaseId,
      effectiveDatabaseId,
      databases
    ),
    selectedInstanceResolved,
  });
  const refetchDatabases = databasesQuery.refetch;
  const refetchInstances = instancesQuery.refetch;
  const refetchSelectedInstance = selectedInstanceQuery.refetch;
  const retryInstanceCatalog = async () => {
    await Promise.allSettled([refetchDatabases()]);
    await Promise.allSettled([refetchInstances(), refetchSelectedInstance()]);
  };

  const navigationCallbacks = useNavigationCallbacks({
    currentPage,
    effDatabaseId: effectiveDatabaseId,
    instanceId: effectiveInstanceId,
    navigate,
    persistSelection,
  });
  const scopeLevel = resolveScopeLevel(effectiveIds);

  const value: DbContextType = {
    databases,
    instances,
    navigateToDatabase: navigationCallbacks.navigateToDatabase,
    navigateToInstance: navigationCallbacks.navigateToInstance,
    navigationIds: effectiveIds,
    queryStates,
    retryInstanceCatalog,
    scopeLevel,
    selectedDatabase,
    selectedInstance,
    viewLevel,
    viewOverview: navigationCallbacks.viewOverview,
  };

  return value;
}

function DbProvider({ children }: { children: React.ReactNode }) {
  const value = useDbProviderValue();
  return <DbContext.Provider value={value}>{children}</DbContext.Provider>;
}

export { DbProvider, useDb };
