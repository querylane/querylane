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
  /authentication failed/iu,
  /password authentication failed/iu,
  /invalid_password/iu,
  /sqlstate\s*28[0-9a-z]{3}/iu,
  /postgresql authentication failed/iu,
];
const REACHABILITY_ERROR_PATTERNS = [
  /connection refused/iu,
  /connection reset/iu,
  /could not connect/iu,
  /host not found/iu,
  /name resolution/iu,
  /network is unreachable/iu,
  /no route to host/iu,
  /postgresql instance is unreachable/iu,
];
const TIMEOUT_ERROR_PATTERNS = [
  /context deadline exceeded/iu,
  /i\/o timeout/iu,
  /timed? out/iu,
  /postgresql connection timed out/iu,
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
