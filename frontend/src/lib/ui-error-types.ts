import type { Code } from "@connectrpc/connect";
import type {
  PostgreSqlErrorKind,
  PostgreSqlErrorRetryGuidance,
} from "@/protogen/querylane/console/v1alpha1/errors_pb";

type AppErrorSource =
  | "boot"
  | "connect"
  | "mutation"
  | "query"
  | "router"
  | "runtime"
  | "setup"
  | "setup_stream"
  | "unknown";

type BlockingErrorReason =
  | "permission_denied"
  | "setup_required"
  | "unauthenticated";

type AppErrorSurface = "inline" | "route" | "silent" | "toast";

interface AppUiErrorContext {
  action?: string | undefined;
  area?: string | undefined;
  componentStack?: string | null | undefined;
  endpoint?: string | undefined;
  routeId?: string | undefined;
  source?: AppErrorSource | undefined;
  stepDisplayName?: string | undefined;
  stepId?: number | string | undefined;
  surface?: AppErrorSurface | undefined;
}

interface AppUiErrorDetail {
  debug: unknown;
  postgres?: AppUiErrorPostgres | undefined;
  summary: string;
  type: string;
}

interface AppUiErrorPostgres {
  conditionName: string | null;
  kind: PostgreSqlErrorKind;
  operation: string | null;
  retryGuidance: PostgreSqlErrorRetryGuidance;
  serverFields: Record<string, string>;
  sqlstate: string | null;
  sqlstateClass: string | null;
}

interface AppUiError {
  blockingReason: BlockingErrorReason | null;
  code: Code | null;
  codeLabel: string | null;
  connectDomain: string | null;
  connectReason: string | null;
  context: AppUiErrorContext;
  details: AppUiErrorDetail[];
  manualRetryable: boolean;
  message: string;
  metadata: Record<string, string[]>;
  originalError: unknown;
  postgres: AppUiErrorPostgres | null;
  rawMessage: string;
  retryGuidance: string | null;
  source: AppErrorSource;
  stack: string | null;
  summary: string;
  technicalDetails: string;
  title: string;
}

interface ReportAppUiErrorDependencies {
  captureException: (
    error: unknown,
    context: {
      extras: Record<string, unknown>;
      tags: Record<string, string>;
    }
  ) => void;
  logger: { error: (message: string, extra: Record<string, unknown>) => void };
  toast: {
    error: (message: string, options?: { description?: string }) => void;
  };
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null;
}

export type {
  AppErrorSource,
  AppErrorSurface,
  AppUiError,
  AppUiErrorContext,
  AppUiErrorDetail,
  AppUiErrorPostgres,
  BlockingErrorReason,
  ReportAppUiErrorDependencies,
};
export { isRecord };
