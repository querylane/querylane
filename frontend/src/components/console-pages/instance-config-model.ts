import { create as createProto } from "@bufbuild/protobuf";
import type { useGetInstanceQuery } from "@/hooks/api/instance";
import { createProtoStandardSchema } from "@/lib/proto-standard-schema";
import {
  normalizeSslNegotiation,
  toSslMode,
  toSslNegotiation,
} from "@/lib/protobuf-enums";
import { isDirectSslNegotiationMode } from "@/lib/ssl-modes";
import {
  CreateInstanceSpecSchema,
  Instance_CredentialState,
  PostgresConfig_SslMode,
  PostgresConfigSchema,
} from "@/protogen/querylane/console/v1alpha1/instance_pb";

type InstanceQueryData = ReturnType<typeof useGetInstanceQuery>["data"];
type InstanceRecord = NonNullable<NonNullable<InstanceQueryData>["instance"]>;

interface InstanceLabelEntry {
  id: string;
  key: string;
  value: string;
}

type InstanceFormFieldName =
  | "database"
  | "displayName"
  | "host"
  | "password"
  | "port"
  | "sslMode"
  | "sslNegotiation"
  | "username";
type InstanceFormInvalidFieldName = InstanceFormFieldName | "labels";
type InstanceFormErrors = Partial<Record<InstanceFormInvalidFieldName, string>>;
type InstanceFormDirtyFields = Partial<
  Record<InstanceFormInvalidFieldName, true>
>;
interface InstanceValidationResult {
  errors: InstanceFormErrors;
  firstInvalidField: InstanceFormInvalidFieldName | null;
}

interface InstanceFormState {
  database: string;
  dirtyFields?: InstanceFormDirtyFields;
  displayName: string;
  host: string;
  labels: InstanceLabelEntry[];
  password: string;
  port: string;
  sslMode: string;
  sslNegotiation: string;
  username: string;
}

const DEFAULT_POSTGRES_PORT = 5432;
const MIN_POSTGRES_PORT = 1;
const MAX_POSTGRES_PORT = 65_535;
const POSTGRES_PORT_PATTERN = /^\d+$/;
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

function createLabelEntry(key = "", value = ""): InstanceLabelEntry {
  return {
    id: crypto.randomUUID(),
    key,
    value,
  };
}

function labelsToEntries(labels: Record<string, string>): InstanceLabelEntry[] {
  return Object.entries(labels).map(([key, value]) =>
    createLabelEntry(key, value)
  );
}

function sortLabels(labels: InstanceLabelEntry[]) {
  return labels
    .map(({ key, value }) => ({ key, value }))
    .sort(
      (left, right) =>
        left.key.localeCompare(right.key) ||
        left.value.localeCompare(right.value)
    );
}

function labelsEqual(a: InstanceLabelEntry[], b: InstanceLabelEntry[]) {
  if (a.length !== b.length) {
    return false;
  }

  const sortedA = sortLabels(a);
  const sortedB = sortLabels(b);
  for (const [index, label] of sortedA.entries()) {
    const other = sortedB[index];
    if (
      other === undefined ||
      label.key !== other.key ||
      label.value !== other.value
    ) {
      return false;
    }
  }
  return true;
}

function parseInstanceFormPort(port: string): number | null {
  const normalizedPort = port.trim();
  const nextPort = Number(normalizedPort);
  if (
    !(
      POSTGRES_PORT_PATTERN.test(normalizedPort) && Number.isInteger(nextPort)
    ) ||
    nextPort < MIN_POSTGRES_PORT ||
    nextPort > MAX_POSTGRES_PORT
  ) {
    return null;
  }
  return nextPort;
}

function labelsToMap(labels: InstanceLabelEntry[]): Record<string, string> {
  const labelsMap: Record<string, string> = {};
  for (const label of labels) {
    labelsMap[label.key.trim()] = label.value;
  }
  return labelsMap;
}

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

/**
 * Trim text fields once at the save boundary so the same values are used for
 * validation, change detection, and the update payload. The password is left
 * untouched because whitespace can be significant in credentials.
 */
function trimInstanceFormState(
  formState: InstanceFormState
): InstanceFormState {
  return {
    ...formState,
    database: formState.database.trim(),
    displayName: formState.displayName.trim(),
    host: formState.host.trim(),
    port: formState.port.trim(),
    username: formState.username.trim(),
  };
}

function buildInstanceConfigUpdatePaths({
  formState,
  instance,
  nextPort,
}: {
  formState: InstanceFormState;
  instance: InstanceRecord;
  nextPort: number;
}) {
  if (
    instance.credentialState === Instance_CredentialState.UNREADABLE &&
    formState.dirtyFields?.password
  ) {
    return ["config"];
  }

  const changedPaths: readonly [changed: boolean | undefined, path: string][] =
    [
      [formState.host !== (instance.config?.host ?? ""), "config.host"],
      [
        nextPort !== (instance.config?.port ?? DEFAULT_POSTGRES_PORT),
        "config.port",
      ],
      [
        formState.database !== (instance.config?.database ?? ""),
        "config.database",
      ],
      [
        formState.username !== (instance.config?.username ?? ""),
        "config.username",
      ],
      [formState.dirtyFields?.password, "config.password"],
      [
        toSslMode(formState.sslMode) !==
          (instance.config?.sslMode ?? PostgresConfig_SslMode.PREFER),
        "config.ssl_mode",
      ],
      [
        toSslNegotiation(formState.sslNegotiation) !==
          normalizeSslNegotiation(instance.config?.sslNegotiation),
        "config.ssl_negotiation",
      ],
    ];
  return changedPaths.flatMap(([changed, path]) => (changed ? [path] : []));
}

function buildInstanceUpdatePaths({
  formState,
  instance,
  nextPort,
}: {
  formState: InstanceFormState;
  instance: InstanceRecord;
  nextPort: number;
}) {
  const updatePaths: string[] = [];
  if (formState.displayName !== instance.displayName) {
    updatePaths.push("display_name");
  }
  updatePaths.push(
    ...buildInstanceConfigUpdatePaths({ formState, instance, nextPort })
  );
  if (!labelsEqual(formState.labels, labelsToEntries(instance.labels ?? {}))) {
    updatePaths.push("labels");
  }
  return updatePaths;
}

export type {
  InstanceFormDirtyFields,
  InstanceFormErrors,
  InstanceFormInvalidFieldName,
  InstanceFormState,
  InstanceLabelEntry,
  InstanceRecord,
};
export {
  buildInstanceUpdatePaths,
  createLabelEntry,
  DEFAULT_POSTGRES_PORT,
  labelsEqual,
  labelsToEntries,
  labelsToMap,
  parseInstanceFormPort,
  trimInstanceFormState,
  validateInstanceForm,
};
