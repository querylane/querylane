import { normalizeAppUiError } from "@/lib/ui-error";
import type { AppUiError } from "@/lib/ui-error-types";

type InstanceConnectionErrorKind =
  | "authentication"
  | "reachability"
  | "timeout"
  | "unknown";

interface InstanceConnectionErrorPresentation {
  kind: InstanceConnectionErrorKind;
  retryGuidance: string;
  summary: string;
  title: string;
}

const AUTHENTICATION_ERROR_PATTERNS = [
  /authentication failed/i,
  /password authentication failed/i,
  /invalid_password/i,
  /sqlstate\s*28[0-9a-z]{3}/i,
  /postgresql authentication failed/i,
];
const REACHABILITY_ERROR_PATTERNS = [
  /connection refused/i,
  /connection reset/i,
  /could not connect/i,
  /host not found/i,
  /name resolution/i,
  /network is unreachable/i,
  /no route to host/i,
  /postgresql instance is unreachable/i,
];
const TIMEOUT_ERROR_PATTERNS = [
  /context deadline exceeded/i,
  /i\/o timeout/i,
  /timed? out/i,
  /postgresql connection timed out/i,
];

function matchesAny(value: string, patterns: RegExp[]): boolean {
  return patterns.some((pattern) => pattern.test(value));
}

function describeInstanceConnectionError(
  rawError: string
): InstanceConnectionErrorPresentation {
  if (matchesAny(rawError, AUTHENTICATION_ERROR_PATTERNS)) {
    return {
      kind: "authentication",
      retryGuidance: "Update the saved credentials, then refresh.",
      summary: "PostgreSQL rejected the saved credentials.",
      title: "PostgreSQL authentication failed",
    };
  }
  if (matchesAny(rawError, TIMEOUT_ERROR_PATTERNS)) {
    return {
      kind: "timeout",
      retryGuidance:
        "Check that PostgreSQL is running and reachable, then refresh.",
      summary: "The PostgreSQL connection attempt timed out.",
      title: "PostgreSQL instance unavailable",
    };
  }
  if (matchesAny(rawError, REACHABILITY_ERROR_PATTERNS)) {
    return {
      kind: "reachability",
      retryGuidance:
        "Check that PostgreSQL is running and reachable, then refresh.",
      summary: "Querylane could not reach the PostgreSQL instance.",
      title: "PostgreSQL instance unavailable",
    };
  }
  return {
    kind: "unknown",
    retryGuidance:
      "Check the saved connection settings and PostgreSQL server, then refresh.",
    summary: "Querylane could not connect to the PostgreSQL instance.",
    title: "PostgreSQL connection failed",
  };
}

function createInstanceConnectionUiError(rawError: string): AppUiError {
  const normalized = normalizeAppUiError(new Error(rawError), {
    area: "console.instance.connection",
    source: "query",
  });
  const presentation = describeInstanceConnectionError(rawError);
  return {
    ...normalized,
    message: presentation.summary,
    retryGuidance: presentation.retryGuidance,
    summary: presentation.summary,
    title: presentation.title,
  };
}

export type {
  InstanceConnectionErrorKind,
  InstanceConnectionErrorPresentation,
};
export { createInstanceConnectionUiError, describeInstanceConnectionError };
