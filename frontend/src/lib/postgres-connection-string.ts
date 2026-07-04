const DEFAULT_POSTGRES_PORT = 5432;
const MAX_POSTGRES_PORT = 65_535;
const LEADING_SLASH = /^\//;

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
  username: string;
}

function normalizePostgresSslMode(
  value: string | null | undefined
): PostgresSslModeValue {
  switch (value?.toLowerCase()) {
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
      return "prefer";
  }
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

export function parsePostgresConnectionString(
  input: string
): ParsedPostgresConnectionString | null {
  const trimmed = input.trim();
  if (
    !(trimmed.startsWith("postgres://") || trimmed.startsWith("postgresql://"))
  ) {
    return null;
  }

  try {
    const url = new URL(trimmed);
    const port = url.port
      ? Number.parseInt(url.port, 10)
      : DEFAULT_POSTGRES_PORT;

    if (!Number.isInteger(port) || port <= 0 || port > MAX_POSTGRES_PORT) {
      return null;
    }

    const sslNegotiation = normalizePostgresSslNegotiation(
      url.searchParams.get("sslnegotiation")
    );
    if (!sslNegotiation) {
      return null;
    }

    return {
      database: decodeURIComponent(url.pathname.replace(LEADING_SLASH, "")),
      host: url.hostname || "localhost",
      password: decodeURIComponent(url.password || ""),
      port,
      sslMode: normalizePostgresSslMode(url.searchParams.get("sslmode")),
      sslNegotiation,
      username: decodeURIComponent(url.username || ""),
    };
  } catch {
    return null;
  }
}
