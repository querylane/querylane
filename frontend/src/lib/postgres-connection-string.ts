import { anyPredicate } from "@/lib/predicates";

const DEFAULT_POSTGRES_PORT = 5432;
const MAX_POSTGRES_PORT = 65_535;
const LEADING_SLASH = /^\//;
const SUPPORTED_QUERY_PARAMETERS = new Set([
  "ssl",
  "sslmode",
  "sslnegotiation",
]);

type PostgresSslModeValue =
  | "allow"
  | "disable"
  | "prefer"
  | "require"
  | "verify-ca"
  | "verify-full";
type PostgresSslNegotiationValue = "direct" | "postgres";

interface ParsedPostgresConnectionString {
  database: string;
  host: string;
  password: string;
  port: number;
  sslMode: PostgresSslModeValue;
  sslNegotiation: PostgresSslNegotiationValue;
  unsupportedParameters: string[];
  username: string;
}

function normalizePostgresSslMode(
  value: string | null | undefined
): PostgresSslModeValue | null {
  switch (value?.toLowerCase()) {
    case undefined:
    case "":
    case "prefer":
      return "prefer";
    case "disable":
      return "disable";
    case "allow":
      return "allow";
    case "require":
      return "require";
    case "verify-ca":
      return "verify-ca";
    case "verify-full":
      return "verify-full";
    default:
      return null;
  }
}

function getPostgresSslMode(searchParams: URLSearchParams) {
  const sslMode = normalizePostgresSslMode(searchParams.get("sslmode"));
  if (!sslMode) {
    return null;
  }

  const sslAlias = searchParams.get("ssl");
  if (sslAlias === null) {
    return sslMode;
  }
  if (sslAlias.toLowerCase() !== "true") {
    return null;
  }
  return searchParams.has("sslmode") ? sslMode : "require";
}

function normalizePostgresHost(hostname: string) {
  if (hostname.startsWith("[") && hostname.endsWith("]")) {
    return hostname.slice(1, -1);
  }
  return hostname || "localhost";
}

function getUnsupportedParameters(searchParams: URLSearchParams) {
  return [
    ...new Set(
      [...searchParams.keys()].filter(
        (parameter) => !SUPPORTED_QUERY_PARAMETERS.has(parameter)
      )
    ),
  ].sort();
}

function hasAmbiguousSslParameters(searchParams: URLSearchParams) {
  return (
    (searchParams.has("ssl") && searchParams.has("sslmode")) ||
    [...SUPPORTED_QUERY_PARAMETERS].some(
      (parameter) => searchParams.getAll(parameter).length > 1
    )
  );
}

function formatUnsupportedPostgresConnectionParameters(
  parameters: readonly string[]
) {
  return parameters.length > 0
    ? `DSN parameters not applied: ${parameters.join(", ")}.`
    : null;
}

function normalizePostgresSslNegotiation(
  value: string | null | undefined
): PostgresSslNegotiationValue | null {
  switch (value?.toLowerCase()) {
    case undefined:
    case "":
    case "postgres":
      return "postgres";
    case "direct":
      return "direct";
    default:
      return null;
  }
}

function hasPostgresProtocol(value: string): boolean {
  return value.startsWith("postgres://") || value.startsWith("postgresql://");
}

export function parsePostgresConnectionString(
  input: string
): ParsedPostgresConnectionString | null {
  const trimmed = input.trim();
  if (!hasPostgresProtocol(trimmed)) {
    return null;
  }

  try {
    const url = new URL(trimmed);
    if (hasAmbiguousSslParameters(url.searchParams)) {
      return null;
    }
    const port = url.port
      ? Number.parseInt(url.port, 10)
      : DEFAULT_POSTGRES_PORT;

    if (
      anyPredicate(
        () => !Number.isInteger(port),
        () => port <= 0,
        () => port > MAX_POSTGRES_PORT
      )
    ) {
      return null;
    }

    const sslNegotiation = normalizePostgresSslNegotiation(
      url.searchParams.get("sslnegotiation")
    );
    if (!sslNegotiation) {
      return null;
    }

    const sslMode = getPostgresSslMode(url.searchParams);
    if (!sslMode) {
      return null;
    }

    const username = decodeURIComponent(url.username || "");
    const database = decodeURIComponent(
      url.pathname.replace(LEADING_SLASH, "")
    );

    return {
      database: database || username,
      host: normalizePostgresHost(url.hostname),
      password: decodeURIComponent(url.password || ""),
      port,
      sslMode,
      sslNegotiation,
      unsupportedParameters: getUnsupportedParameters(url.searchParams),
      username,
    };
  } catch {
    return null;
  }
}

export { formatUnsupportedPostgresConnectionParameters };
