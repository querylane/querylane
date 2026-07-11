import { Code, ConnectError } from "@connectrpc/connect";

const DEFAULT_QUERY_GC_TIME_MS = 300_000;

/**
 * Central Querylane cache/fetch policy.
 * Keep resource freshness decisions here so route loaders, hooks, and intent
 * prefetches share one contract.
 */
const ONE_MINUTE_IN_MILLISECONDS = 60_000;
const TWO_MINUTES_IN_MILLISECONDS = 2 * ONE_MINUTE_IN_MILLISECONDS;
const FIVE_MINUTES_IN_MILLISECONDS = DEFAULT_QUERY_GC_TIME_MS;
const UNAVAILABLE_QUERY_RETRY_DELAY_MS = 2000;

export const QUERY_STALE_TIME = {
  databaseList: TWO_MINUTES_IN_MILLISECONDS,
  default: TWO_MINUTES_IN_MILLISECONDS,
  explainPlan: 0,
  extensionList: TWO_MINUTES_IN_MILLISECONDS,
  immediate: 0,
  instanceDetail: TWO_MINUTES_IN_MILLISECONDS,
  instanceList: FIVE_MINUTES_IN_MILLISECONDS,
  publicGrants: 15_000,
  roleDefaultPrivileges: 15_000,
  roleGrants: 15_000,
  roleList: FIVE_MINUTES_IN_MILLISECONDS,
  roleOwnedObjects: 15_000,
  schemaList: TWO_MINUTES_IN_MILLISECONDS,
  selectedDatabase: TWO_MINUTES_IN_MILLISECONDS,
  static: Number.POSITIVE_INFINITY,
  tableMetadata: FIVE_MINUTES_IN_MILLISECONDS,
  tableRows: 0,
  // Workflow state moves while the user watches (running → completed), so it
  // goes stale as fast as the grant views.
  workflowList: 15_000,
} as const;

export const UNAVAILABLE_QUERY_RETRY_LIMIT = 1;

/**
 * Retry only failures where the server said it cannot serve the request right
 * now (e.g. a serverless Postgres instance still waking up). Timeouts are not
 * retried: the user already waited the full client deadline, so surface the
 * retryable error instead of silently doubling the wait.
 */
export function shouldRetryQuery(
  failureCount: number,
  error: unknown
): boolean {
  if (failureCount >= UNAVAILABLE_QUERY_RETRY_LIMIT) {
    return false;
  }
  return error instanceof ConnectError && error.code === Code.Unavailable;
}

export const QUERY_DEFAULTS = {
  gcTime: DEFAULT_QUERY_GC_TIME_MS,
  refetchOnReconnect: true,
  refetchOnWindowFocus: false,
  retry: shouldRetryQuery,
  retryDelay: UNAVAILABLE_QUERY_RETRY_DELAY_MS,
  staleTime: QUERY_STALE_TIME.default,
} as const;

export const MUTATION_DEFAULTS = {
  retry: false,
} as const;

export const STATIC_QUERY_OPTIONS = {
  refetchOnMount: false,
  refetchOnReconnect: false,
  refetchOnWindowFocus: false,
  staleTime: QUERY_STALE_TIME.static,
} as const;

export const RESOURCE_QUERY_OPTIONS = {
  databaseList: {
    staleTime: QUERY_STALE_TIME.databaseList,
  },
  explainPlan: {
    staleTime: QUERY_STALE_TIME.explainPlan,
  },
  extensionList: {
    staleTime: QUERY_STALE_TIME.extensionList,
  },
  instanceDetail: {
    staleTime: QUERY_STALE_TIME.instanceDetail,
  },
  instanceList: {
    staleTime: QUERY_STALE_TIME.instanceList,
  },
  publicGrants: {
    staleTime: QUERY_STALE_TIME.publicGrants,
  },
  roleDefaultPrivileges: {
    staleTime: QUERY_STALE_TIME.roleDefaultPrivileges,
  },
  roleGrants: {
    staleTime: QUERY_STALE_TIME.roleGrants,
  },
  roleList: {
    staleTime: QUERY_STALE_TIME.roleList,
  },
  roleOwnedObjects: {
    staleTime: QUERY_STALE_TIME.roleOwnedObjects,
  },
  schemaList: {
    staleTime: QUERY_STALE_TIME.schemaList,
  },
  selectedDatabase: {
    staleTime: QUERY_STALE_TIME.selectedDatabase,
  },
  tableMetadata: {
    staleTime: QUERY_STALE_TIME.tableMetadata,
  },
  tableRows: {
    staleTime: QUERY_STALE_TIME.tableRows,
  },
  workflowList: {
    staleTime: QUERY_STALE_TIME.workflowList,
  },
} as const;

export const INTENT_PREFETCH_POLICY = {
  delayMs: 150,
} as const;
