import { ConnectError } from "@connectrpc/connect";

/**
 * Detection of non-Connect API responses. When Querylane runs behind a
 * reverse proxy (an auth gateway serving a sign-in page after session expiry,
 * or an HTML gateway error page while the backend is down), RPCs receive HTML
 * instead of a Connect response and connect-web surfaces an opaque parse
 * failure. The fetch wrapper here intercepts those responses before connect
 * parses them and throws a typed error that normalizeAppUiError turns into
 * friendly copy, keeping the raw body out of the visible message.
 */
type UnexpectedResponseKind = "auth" | "redirect" | "server" | "unexpected";

interface UnexpectedResponseInfo {
  bodySnippet: string | null;
  contentType: string | null;
  kind: UnexpectedResponseKind;
  /** HTTP status; 0 for an opaqueredirect response. */
  status: number;
  url: string;
}

interface UnexpectedResponsePresentation {
  retryGuidance: string;
  summary: string;
  title: string;
}

const UNEXPECTED_RESPONSE_TITLE = "Unexpected server response";
const RELOAD_SIGN_IN_GUIDANCE =
  "Reload the page — you may need to sign in again.";
const BODY_SNIPPET_MAX_LENGTH = 2048;

const HTTP_STATUS_OK = 200;
const HTTP_STATUS_UNAUTHORIZED = 401;
const HTTP_STATUS_FORBIDDEN = 403;
const REDIRECT_STATUS_MIN = 300;
const REDIRECT_STATUS_LIMIT = 400;
const SERVER_ERROR_STATUS_MIN = 500;

/**
 * Permissive prefix match for the Connect protocol content types
 * (application/proto, application/json, and their connect+ streaming
 * variants). If a response plausibly is Connect, we never intervene so real
 * Connect error decoding stays untouched.
 */
const CONNECT_CONTENT_TYPE_PATTERN =
  /^application\/(?:connect\+)?(?:json|proto)\b/i;
const UNARY_JSON_CONTENT_TYPE_PATTERN = /^application\/json\b/i;

function describeUnexpectedResponse(
  info: UnexpectedResponseInfo
): UnexpectedResponsePresentation {
  switch (info.kind) {
    case "redirect":
      return {
        retryGuidance: RELOAD_SIGN_IN_GUIDANCE,
        summary:
          "The request was redirected instead of reaching the Querylane API. A sign-in page or proxy may have intercepted it.",
        title: UNEXPECTED_RESPONSE_TITLE,
      };
    case "auth":
      return {
        retryGuidance: RELOAD_SIGN_IN_GUIDANCE,
        summary: `The server returned an access error page (HTTP ${info.status}) instead of an API response. Your session may have expired.`,
        title: UNEXPECTED_RESPONSE_TITLE,
      };
    case "server":
      return {
        retryGuidance:
          "Retry in a moment. If the problem persists, check that the Querylane server is running.",
        summary: `The server returned a gateway error page (HTTP ${info.status}) instead of an API response. The Querylane server may be down or restarting.`,
        title: UNEXPECTED_RESPONSE_TITLE,
      };
    default:
      return {
        retryGuidance: "Reload the page and try again.",
        summary: `The server returned an unexpected ${info.contentType ?? "unknown"} response (HTTP ${info.status}) instead of an API response. A proxy in front of Querylane may have intercepted the request.`,
        title: UNEXPECTED_RESPONSE_TITLE,
      };
  }
}

class UnexpectedResponseError extends Error {
  readonly info: UnexpectedResponseInfo;

  constructor(info: UnexpectedResponseInfo) {
    super(describeUnexpectedResponse(info).summary);
    this.name = "UnexpectedResponseError";
    this.info = info;
  }
}

function isConnectContentType(contentType: string | null): boolean {
  return contentType !== null && CONNECT_CONTENT_TYPE_PATTERN.test(contentType);
}

function isRedirectStatus(status: number): boolean {
  return status >= REDIRECT_STATUS_MIN && status < REDIRECT_STATUS_LIMIT;
}

function classifyUnexpectedResponseKind(
  status: number
): UnexpectedResponseKind {
  if (status === 0 || isRedirectStatus(status)) {
    return "redirect";
  }
  if (status === HTTP_STATUS_UNAUTHORIZED || status === HTTP_STATUS_FORBIDDEN) {
    return "auth";
  }
  if (status >= SERVER_ERROR_STATUS_MIN) {
    return "server";
  }
  return "unexpected";
}

function isRedirectResponse(
  response: Pick<Response, "status" | "type">
): boolean {
  return (
    response.type === "opaqueredirect" || isRedirectStatus(response.status)
  );
}

function sanitizeBodySnippet(text: string): string | null {
  const compact = text.replaceAll(/\s+/g, " ").trim();
  if (!compact) {
    return null;
  }
  return compact.slice(0, BODY_SNIPPET_MAX_LENGTH);
}

async function readBodySnippet(response: Response): Promise<string | null> {
  try {
    return sanitizeBodySnippet(await response.text());
  } catch {
    return null;
  }
}

function buildUnexpectedResponseError(
  response: Response,
  bodySnippet: string | null
): UnexpectedResponseError {
  return new UnexpectedResponseError({
    bodySnippet,
    contentType: response.headers.get("content-type"),
    kind: classifyUnexpectedResponseKind(response.status),
    status: response.status,
    url: response.url,
  });
}

function looksLikeJsonObject(text: string): boolean {
  return text.trimStart().startsWith("{");
}

/**
 * Non-200 unary responses claiming application/json go through connect's
 * error-JSON decoder; when a proxy lies about the content type and sends HTML,
 * that decoder throws a SyntaxError stacktrace at the user. Sniff the (small)
 * error body via a clone and intercept when it clearly is not JSON.
 */
async function sniffUnaryErrorBody(response: Response): Promise<Response> {
  let bodyText: string;
  try {
    bodyText = await response.clone().text();
  } catch {
    return response;
  }
  if (looksLikeJsonObject(bodyText)) {
    return response;
  }
  throw buildUnexpectedResponseError(response, sanitizeBodySnippet(bodyText));
}

async function ensureConnectResponse(response: Response): Promise<Response> {
  if (isRedirectResponse(response)) {
    throw buildUnexpectedResponseError(response, null);
  }

  const contentType = response.headers.get("content-type");
  if (!isConnectContentType(contentType)) {
    throw buildUnexpectedResponseError(
      response,
      await readBodySnippet(response)
    );
  }

  if (
    response.status !== HTTP_STATUS_OK &&
    contentType !== null &&
    UNARY_JSON_CONTENT_TYPE_PATTERN.test(contentType)
  ) {
    return await sniffUnaryErrorBody(response);
  }

  return response;
}

function defaultBaseFetch(
  input: RequestInfo | URL,
  init?: RequestInit
): Promise<Response> {
  return globalThis.fetch(input, init);
}

/**
 * Wraps fetch for the Connect transports. Overrides connect-web's
 * redirect: "error" with "manual" so a proxy redirect is observable (a
 * Connect server never redirects) instead of surfacing as a generic network
 * failure. Genuine fetch rejections (network down, aborts) pass through
 * untouched.
 */
function createUnexpectedResponseFetch(
  baseFetch: typeof globalThis.fetch = defaultBaseFetch
): typeof globalThis.fetch {
  return async (input, init) => {
    const response = await baseFetch(input, { ...init, redirect: "manual" });
    return await ensureConnectResponse(response);
  };
}

function findUnexpectedResponse(error: unknown): UnexpectedResponseInfo | null {
  if (error instanceof UnexpectedResponseError) {
    return error.info;
  }
  if (
    error instanceof ConnectError &&
    error.cause instanceof UnexpectedResponseError
  ) {
    return error.cause.info;
  }
  return null;
}

export type { UnexpectedResponseInfo, UnexpectedResponseKind };
export {
  BODY_SNIPPET_MAX_LENGTH,
  classifyUnexpectedResponseKind,
  createUnexpectedResponseFetch,
  describeUnexpectedResponse,
  findUnexpectedResponse,
  isConnectContentType,
  isRedirectResponse,
  UnexpectedResponseError,
};
