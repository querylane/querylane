import { isDirectSslNegotiationMode } from "@/lib/ssl-modes";

const MIN_POSTGRES_PORT = 1;
const MAX_POSTGRES_PORT = 65_535;
const POSTGRES_PORT_PATTERN = /^\d+$/;

interface CreateInstanceValidationLabel {
  key: string;
}

interface CreateInstanceValidationFormState {
  database: string;
  displayName: string;
  host: string;
  instanceId: string;
  labels: CreateInstanceValidationLabel[];
  password: string;
  port: string;
  sslMode: string;
  sslNegotiation: string;
  username: string;
}

type CreateInstanceFieldName = Exclude<
  keyof CreateInstanceValidationFormState,
  "labels"
>;
type CreateInstanceInvalidFieldName = CreateInstanceFieldName | "labels";
type CreateInstanceFormErrors = Partial<
  Record<CreateInstanceInvalidFieldName, string>
>;
interface CreateInstanceValidationResult {
  errors: CreateInstanceFormErrors;
  firstInvalidField: CreateInstanceInvalidFieldName | null;
}

const FIELD_FOCUS_ORDER = [
  "displayName",
  "host",
  "port",
  "database",
  "username",
  "password",
  "sslNegotiation",
  "labels",
] as const satisfies readonly CreateInstanceInvalidFieldName[];

function isInvalidPostgresPort(normalizedPort: string, port: number): boolean {
  const hasNumericFormat =
    POSTGRES_PORT_PATTERN.test(normalizedPort) && Number.isInteger(port);
  return (
    !hasNumericFormat || port < MIN_POSTGRES_PORT || port > MAX_POSTGRES_PORT
  );
}

function hasInvalidDirectSslNegotiation(
  sslMode: string,
  sslNegotiation: string
): boolean {
  return sslNegotiation === "direct" && !isDirectSslNegotiationMode(sslMode);
}

function validateCreateInstanceForm(
  formState: CreateInstanceValidationFormState
): CreateInstanceValidationResult {
  const errors: CreateInstanceFormErrors = {};
  if (formState.displayName.trim().length === 0) {
    errors.displayName = "Display name is required.";
  }
  if (formState.host.trim().length === 0) {
    errors.host = "Host is required.";
  }
  const normalizedPort = formState.port.trim();
  const port = Number(normalizedPort);
  if (isInvalidPostgresPort(normalizedPort, port)) {
    errors.port = `Port must be between ${MIN_POSTGRES_PORT} and ${MAX_POSTGRES_PORT}.`;
  }
  if (formState.database.trim().length === 0) {
    errors.database = "Database is required.";
  }
  if (formState.username.trim().length === 0) {
    errors.username = "Username is required.";
  }
  if (formState.password.trim().length === 0) {
    errors.password = "Password is required.";
  }
  if (
    hasInvalidDirectSslNegotiation(formState.sslMode, formState.sslNegotiation)
  ) {
    errors.sslNegotiation =
      "Direct SSL negotiation requires SSL mode require, verify-ca, or verify-full.";
  }
  if (formState.labels.some((label) => label.key.trim().length === 0)) {
    errors.labels = "Label keys cannot be empty.";
  }
  return {
    errors,
    firstInvalidField: FIELD_FOCUS_ORDER.find((field) => errors[field]) ?? null,
  };
}

export type {
  CreateInstanceFieldName,
  CreateInstanceFormErrors,
  CreateInstanceInvalidFieldName,
};
export { validateCreateInstanceForm };
