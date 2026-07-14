import { createRegistry } from "@bufbuild/protobuf";
import type { Interceptor } from "@connectrpc/connect";
import { createConnectTransport } from "@connectrpc/connect-web";

import { env } from "@/env";
import { logger } from "@/lib/diagnostics";
import { createInstanceRpcConcurrencyInterceptor } from "@/lib/instance-rpc-concurrency";
import {
  attachAppUiErrorContext,
  normalizeAppUiError,
  reportAppUiError,
} from "@/lib/ui-error";
import { file_google_rpc_error_details } from "@/protogen/google/rpc/error_details_pb";
import { file_querylane_console_v1alpha1_errors } from "@/protogen/querylane/console/v1alpha1/errors_pb";
import { decideBlockingAppState } from "@/stores/blocking-app-state";
import { markSetupRequired } from "@/stores/setup-required-signal";

/**
 * Global interceptor that normalizes ConnectRPC failures from any API call,
 * reports them once, and updates global blocker/setup state for route redirects.
 */
interface BlockingErrorStoreModule {
  useBlockingErrorStore: {
    getState: () => {
      setBlockingError: (
        error: ReturnType<typeof normalizeAppUiError>,
        returnTo?: string | null
      ) => void;
    };
  };
}

interface SetupInterceptorDependencies {
  getCurrentHref: () => string | null;
  loadBlockingErrorStore: () => Promise<BlockingErrorStoreModule>;
  logger: typeof logger;
  markSetupRequired: () => void;
}

interface ConnectRequestLike {
  method?: { name?: string | undefined };
  service?: { typeName?: string | undefined };
}

const EXPECTED_FAILURE_RPC_PATH =
  "querylane.console.v1alpha1.InstanceService/TestInstanceConnection";

const defaultSetupInterceptorDependencies: SetupInterceptorDependencies = {
  getCurrentHref: () =>
    typeof window === "undefined"
      ? null
      : `${window.location.pathname}${window.location.search}${window.location.hash}`,
  loadBlockingErrorStore: () => import("@/stores/blocking-error-store"),
  logger,
  markSetupRequired,
};

function getRpcEndpoint(req: unknown): string {
  if (typeof req !== "object" || req === null) {
    return "unknown.endpoint";
  }

  const connectRequest = req as ConnectRequestLike;
  const serviceName = connectRequest.service?.typeName ?? "unknown.service";
  const methodName = connectRequest.method?.name ?? "unknown";

  return `${serviceName}/${methodName}`;
}

function createSetupInterceptor(
  dependencies: SetupInterceptorDependencies = defaultSetupInterceptorDependencies
): Interceptor {
  return (next) => async (req) => {
    const endpoint = getRpcEndpoint(req);

    try {
      return await next(req);
    } catch (err) {
      const errorContext = {
        area: "transport",
        endpoint,
        source: "connect",
      } as const;
      attachAppUiErrorContext(err, errorContext);
      const uiError = normalizeAppUiError(err, errorContext);

      const blockingDecision = decideBlockingAppState({
        currentHref: dependencies.getCurrentHref(),
        error: uiError,
      });

      if (blockingDecision.setupRequired) {
        dependencies.logger.info("Setup required detected from API response", {
          endpoint,
        });

        dependencies.markSetupRequired();
      }

      if (blockingDecision.blockingError) {
        const { useBlockingErrorStore } =
          await dependencies.loadBlockingErrorStore();
        useBlockingErrorStore
          .getState()
          .setBlockingError(
            blockingDecision.blockingError,
            blockingDecision.returnTo
          );
      }

      reportAppUiError(uiError, {
        expected: endpoint === EXPECTED_FAILURE_RPC_PATH,
        tags: {
          endpoint,
        },
      });

      throw err;
    }
  };
}

const setupInterceptor = createSetupInterceptor();

interface ConnectBaseUrlOptions {
  configuredBaseUrl: string;
  isDevelopment: boolean;
  locationOrigin: string | null;
}

function resolveConnectBaseUrl({
  configuredBaseUrl,
  isDevelopment,
  locationOrigin: currentOrigin,
}: ConnectBaseUrlOptions): string {
  const trimmedBaseUrl = configuredBaseUrl.trim();
  if (trimmedBaseUrl) {
    return trimmedBaseUrl;
  }

  if (isDevelopment || !currentOrigin) {
    return "http://localhost:8080";
  }

  return currentOrigin;
}

/**
 * Client-side deadline for every RPC. Aborting the fetch at the deadline frees
 * the browser's per-origin connection slot (a hanging instance would otherwise
 * starve all RPCs app-wide), and the Connect-Timeout-Ms header propagates the
 * deadline to the backend so its work is canceled too. 30s matches the
 * server-side statement_timeout applied to ReadRows, so a legitimate slow read
 * is never cut short by the client.
 */
const DEFAULT_RPC_TIMEOUT_MS = 30_000;
/**
 * Deadline for RPCs that may legitimately run long (e.g. EXPLAIN ANALYZE,
 * which the backend caps at 60s). Kept above the server cap plus grace so the
 * server-side limit always fires first.
 */
const LONG_RUNNING_RPC_TIMEOUT_MS = 90_000;

const locationOrigin =
  typeof window === "undefined" ? null : window.location.origin;
const connectBaseUrl = resolveConnectBaseUrl({
  configuredBaseUrl: env.PUBLIC_API_BASE_URL,
  isDevelopment: import.meta.env.DEV,
  locationOrigin,
});

/**
 * One shared limiter across both transports so the per-instance concurrency
 * cap covers every RPC regardless of which deadline tier it uses. It sits
 * after (inside) the setup interceptor so failures raised while a request is
 * queued still flow through error normalization and reporting.
 */
const instanceRpcConcurrencyInterceptor =
  createInstanceRpcConcurrencyInterceptor();

/**
 * Registry of the `google.protobuf.Any` detail types the backend packs into
 * `google.rpc.Status.details` on partial errors (e.g. GetInstanceOverview,
 * CheckInstanceHealth, QueryMetrics). Without it, connect cannot decode those
 * Any values from JSON and the whole response fails to deserialize.
 */
const errorDetailRegistry = createRegistry(
  file_google_rpc_error_details,
  file_querylane_console_v1alpha1_errors
);

function createAppConnectTransport(defaultTimeoutMs: number) {
  return createConnectTransport({
    baseUrl: connectBaseUrl,
    defaultTimeoutMs,
    interceptors: [setupInterceptor, instanceRpcConcurrencyInterceptor],
    jsonOptions: { registry: errorDetailRegistry },
  });
}

const transport = createAppConnectTransport(DEFAULT_RPC_TIMEOUT_MS);
const longRunningTransport = createAppConnectTransport(
  LONG_RUNNING_RPC_TIMEOUT_MS
);

export {
  createSetupInterceptor,
  DEFAULT_RPC_TIMEOUT_MS,
  LONG_RUNNING_RPC_TIMEOUT_MS,
  longRunningTransport,
  resolveConnectBaseUrl,
  transport,
};
