import { create as createProto } from "@bufbuild/protobuf";
import {
  type InstanceFormErrors,
  type InstanceFormInvalidFieldName,
  type InstanceFormState,
  labelsToMap,
  MAX_POSTGRES_PORT,
  MIN_POSTGRES_PORT,
  parseInstanceFormPort,
} from "@/components/console-pages/instance-config-model";
import { createProtoStandardSchema } from "@/lib/proto-standard-schema";
import { toSslMode, toSslNegotiation } from "@/lib/protobuf-enums";
import { isDirectSslNegotiationMode } from "@/lib/ssl-modes";
import {
  CreateInstanceSpecSchema,
  PostgresConfigSchema,
} from "@/protogen/querylane/console/v1alpha1/instance_pb";

interface InstanceValidationResult {
  errors: InstanceFormErrors;
  firstInvalidField: InstanceFormInvalidFieldName | null;
}

const INSTANCE_CONFIG_STANDARD_SCHEMA = createProtoStandardSchema(
  CreateInstanceSpecSchema
);
const INSTANCE_FIELD_FOCUS_ORDER = [
  "displayName",
  "host",
  "port",
  "database",
  "username",
  "password",
  "sslNegotiation",
  "labels",
] as const satisfies readonly InstanceFormInvalidFieldName[];

function getInstanceFormErrorMessage(
  field: InstanceFormInvalidFieldName
): string {
  switch (field) {
    case "database":
      return "Default database is required.";
    case "displayName":
      return "Display name is required.";
    case "host":
      return "Host is required.";
    case "labels":
      return "Label keys cannot be empty.";
    case "password":
      return "Password is required.";
    case "port":
      return `Port must be between ${MIN_POSTGRES_PORT} and ${MAX_POSTGRES_PORT}.`;
    case "username":
      return "Username is required.";
    case "sslMode":
      return "SSL mode is invalid.";
    case "sslNegotiation":
      return "Direct SSL negotiation requires SSL mode require, verify-ca, or verify-full.";
    default:
      return "Invalid field value.";
  }
}

function getIssueField(
  path: readonly unknown[]
): InstanceFormInvalidFieldName | null {
  const [first, second] = path;
  if (first === "displayName") {
    return "displayName";
  }
  if (first === "labels") {
    return "labels";
  }
  if (first !== "config") {
    return null;
  }
  switch (second) {
    case "database":
    case "host":
    case "password":
    case "port":
    case "username":
      return second;
    case "sslMode":
      return "sslMode";
    case "sslNegotiation":
      return "sslNegotiation";
    default:
      return null;
  }
}

function getSslNegotiationErrors(
  formState: InstanceFormState
): InstanceFormErrors {
  if (
    formState.sslNegotiation === "direct" &&
    !isDirectSslNegotiationMode(formState.sslMode)
  ) {
    return {
      sslNegotiation: getInstanceFormErrorMessage("sslNegotiation"),
    };
  }
  return {};
}

function collectInstanceFormErrors(
  formState: InstanceFormState,
  issues: readonly { path?: readonly unknown[] | undefined }[] | undefined
): InstanceFormErrors {
  const errors: InstanceFormErrors = {};
  for (const issue of issues ?? []) {
    const field = getIssueField(issue.path ?? []);
    if (!field) {
      continue;
    }
    if (field === "password" && !formState.dirtyFields?.password) {
      continue;
    }
    errors[field] ??= getInstanceFormErrorMessage(field);
  }
  return errors;
}

function validateInstanceForm(
  formState: InstanceFormState
): InstanceValidationResult {
  const parsedPort = parseInstanceFormPort(formState.port);
  const spec = createProto(CreateInstanceSpecSchema, {
    config: createProto(PostgresConfigSchema, {
      database: formState.database.trim(),
      host: formState.host.trim(),
      password: formState.password,
      port: parsedPort ?? 0,
      sslMode: toSslMode(formState.sslMode),
      sslNegotiation: toSslNegotiation(formState.sslNegotiation),
      username: formState.username.trim(),
    }),
    displayName: formState.displayName.trim(),
    labels: labelsToMap(formState.labels),
  });

  const validation =
    INSTANCE_CONFIG_STANDARD_SCHEMA["~standard"].validate(spec);
  if (validation instanceof Promise) {
    throw new Error("Instance config validation must be synchronous.");
  }
  const errors = collectInstanceFormErrors(formState, validation.issues);
  Object.assign(errors, getSslNegotiationErrors(formState));

  return {
    errors,
    firstInvalidField:
      INSTANCE_FIELD_FOCUS_ORDER.find((field) => errors[field]) ?? null,
  };
}

export { validateInstanceForm };
