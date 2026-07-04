const SSL_MODE_OPTIONS = [
  {
    description: "Never use TLS. Connect only over an unencrypted session.",
    value: "disable",
  },
  {
    description: "Try an unencrypted connection first, then fall back to TLS.",
    value: "allow",
  },
  {
    description: "Try TLS first, then fall back to an unencrypted connection.",
    value: "prefer",
  },
  {
    description:
      "Require TLS encryption without verifying the server CA or hostname.",
    value: "require",
  },
  {
    description:
      "Require TLS and verify the server certificate against a trusted CA.",
    value: "verify-ca",
  },
  {
    description:
      "Require TLS and verify both the trusted CA and the server hostname.",
    value: "verify-full",
  },
] as const;

const DIRECT_SSL_NEGOTIATION_SSL_MODES = [
  "require",
  "verify-ca",
  "verify-full",
] as const;

const SSL_NEGOTIATION_OPTIONS = [
  {
    description:
      "Ask PostgreSQL whether SSL is supported before starting TLS. This is the most compatible option.",
    value: "postgres",
  },
  {
    description:
      "Start TLS immediately with libpq sslnegotiation=direct. Requires SSL mode require or stronger.",
    value: "direct",
  },
] as const;

type SslModeOption = (typeof SSL_MODE_OPTIONS)[number];
type SslModeOptionValue = SslModeOption["value"];
type SslNegotiationOption = (typeof SSL_NEGOTIATION_OPTIONS)[number];
type SslNegotiationOptionValue = SslNegotiationOption["value"];

function getSslModeOption(
  value: string | undefined
): SslModeOption | undefined {
  return SSL_MODE_OPTIONS.find((option) => option.value === value);
}

function getSslNegotiationOption(
  value: string | undefined
): SslNegotiationOption | undefined {
  return SSL_NEGOTIATION_OPTIONS.find((option) => option.value === value);
}

function isDirectSslNegotiationMode(sslMode: string) {
  return DIRECT_SSL_NEGOTIATION_SSL_MODES.some((mode) => mode === sslMode);
}

export type {
  SslModeOption,
  SslModeOptionValue,
  SslNegotiationOption,
  SslNegotiationOptionValue,
};
export {
  getSslModeOption,
  getSslNegotiationOption,
  isDirectSslNegotiationMode,
  SSL_MODE_OPTIONS,
  SSL_NEGOTIATION_OPTIONS,
};
