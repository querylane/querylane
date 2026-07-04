import type { Code } from "@connectrpc/connect";

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

interface AppUiErrorRequestContext {
  headers?: Record<string, string[]> | null | undefined;
  host: string | null;
  plaintext: boolean;
  requestJson: string | null;
  requestJsonNote: string | null;
  requestMethod: string | null;
  rpcPath: string | null;
  url: string | null;
}

interface AppUiErrorResponseContext {
  bodyJson: unknown;
  bodyText: string | null;
  contentType: string | null;
  decodedConnectCode: Code | null;
  decodedConnectCodeLabel: string | null;
  decodedConnectDetails: AppUiErrorDetail[];
  decodedConnectMessage: string | null;
  status: number | null;
  statusText: string | null;
  truncated: boolean;
}

interface AppUiErrorReproductionRequest {
  body: string;
  headers: Record<string, string[]>;
  method: string;
  rpcPath: string;
  url: string;
}

interface AppUiErrorReproductionDownloadPayload {
  message: string;
  request: AppUiErrorReproductionRequest;
  technicalDetails: string;
  title: string;
  transcript: string;
  version: 1;
}

interface AppUiErrorReproduction {
  curlCommand: string;
  downloadFilename: typeof REQUEST_FAILED_REPRO_DOWNLOAD_FILENAME;
  downloadPayload: AppUiErrorReproductionDownloadPayload;
}

interface AppUiErrorContext {
  action?: string | undefined;
  area?: string | undefined;
  componentStack?: string | null | undefined;
  endpoint?: string | undefined;
  request?: AppUiErrorRequestContext | undefined;
  response?: AppUiErrorResponseContext | undefined;
  routeId?: string | undefined;
  source?: AppErrorSource | undefined;
  stepDisplayName?: string | undefined;
  stepId?: number | string | undefined;
  surface?: AppErrorSurface | undefined;
}

interface AppUiErrorDetail {
  debug: unknown;
  hasRawValue: boolean;
  postgres?: AppUiErrorPostgres | undefined;
  summary: string;
  type: string;
}

interface AppUiErrorPostgres {
  conditionName: string | null;
  operation: string | null;
  sqlstate: string | null;
  sqlstateClass: string | null;
}

interface AppUiErrorTechnicalSection {
  content: string;
  id: string;
  language: string;
  title: string;
}

type AppUiErrorTechnicalDetailsObject = Record<string, unknown>;

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
  reproduction: AppUiErrorReproduction | null;
  retryGuidance: string | null;
  source: AppErrorSource;
  stack: string | null;
  technicalDetails: string;
  technicalDetailsObject: AppUiErrorTechnicalDetailsObject;
  technicalDetailsText: string;
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

const CONNECT_ERROR_SNAPSHOT_BODY_HEADER = "x-querylane-error-body-bin";
const CONNECT_ERROR_SNAPSHOT_CONTENT_TYPE_HEADER =
  "x-querylane-error-content-type";
const CONNECT_ERROR_SNAPSHOT_STATUS_HEADER = "x-querylane-error-status";
const CONNECT_ERROR_SNAPSHOT_STATUS_TEXT_HEADER =
  "x-querylane-error-status-text";
const CONNECT_ERROR_SNAPSHOT_TRUNCATED_HEADER =
  "x-querylane-error-body-truncated";

const REQUEST_PAYLOAD_SERIALIZATION_FAILURE_MESSAGE =
  "Request payload could not be serialized.";
const STREAMING_INPUT_REQUEST_MESSAGE =
  "Request payload omitted because the RPC uses streaming input.";
const REQUEST_FAILED_REPRO_DOWNLOAD_FILENAME = "request-failed-repro.json";

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
  AppUiErrorReproduction,
  AppUiErrorRequestContext,
  AppUiErrorResponseContext,
  AppUiErrorTechnicalDetailsObject,
  AppUiErrorTechnicalSection,
  BlockingErrorReason,
  ReportAppUiErrorDependencies,
};
export {
  CONNECT_ERROR_SNAPSHOT_BODY_HEADER,
  CONNECT_ERROR_SNAPSHOT_CONTENT_TYPE_HEADER,
  CONNECT_ERROR_SNAPSHOT_STATUS_HEADER,
  CONNECT_ERROR_SNAPSHOT_STATUS_TEXT_HEADER,
  CONNECT_ERROR_SNAPSHOT_TRUNCATED_HEADER,
  isRecord,
  REQUEST_FAILED_REPRO_DOWNLOAD_FILENAME,
  REQUEST_PAYLOAD_SERIALIZATION_FAILURE_MESSAGE,
  STREAMING_INPUT_REQUEST_MESSAGE,
};
