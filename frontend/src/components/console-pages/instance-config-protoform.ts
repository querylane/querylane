import { create as createProto } from "@bufbuild/protobuf";
import {
  type InstanceRecord,
  labelsEqual,
  labelsToEntries,
} from "@/components/console-pages/instance-config-model";
import type { UseProtoFormReturn } from "@/hooks/use-proto-form";
import { normalizeSslNegotiation } from "@/lib/protobuf-enums";
import {
  Instance_CredentialState,
  InstanceSchema,
  PostgresConfig_SslMode,
  PostgresConfigSchema,
} from "@/protogen/querylane/console/v1alpha1/instance_pb";

type InstanceProtoForm = UseProtoFormReturn<typeof InstanceSchema>;
const DEFAULT_POSTGRES_PORT = 5432;

function createInstanceFormDefaults(instance: InstanceRecord) {
  return createProto(InstanceSchema, {
    config: createProto(PostgresConfigSchema, {
      database: instance.config?.database ?? "",
      host: instance.config?.host ?? "",
      password: instance.config?.password ?? "",
      port: instance.config?.port ?? DEFAULT_POSTGRES_PORT,
      sslMode: instance.config?.sslMode ?? PostgresConfig_SslMode.PREFER,
      sslNegotiation: normalizeSslNegotiation(instance.config?.sslNegotiation),
      username: instance.config?.username ?? "",
    }),
    displayName: instance.displayName,
    labels: instance.labels,
    name: instance.name,
  });
}

function normalizeInstanceProtoForm(form: InstanceProtoForm) {
  const values = form.getValues();
  const options = {
    shouldDirty: true,
    shouldTouch: false,
    shouldValidate: false,
  } as const;
  form.setValue("displayName", values.displayName.trim(), options);
  form.setValue("config.host", values.config?.host.trim() ?? "", options);
  form.setValue(
    "config.database",
    values.config?.database.trim() ?? "",
    options
  );
  form.setValue(
    "config.username",
    values.config?.username.trim() ?? "",
    options
  );
}

function valuesEqual(
  path: string,
  current: ReturnType<InstanceProtoForm["createMessage"]>,
  persisted: InstanceRecord
) {
  switch (path) {
    case "display_name":
      return current.displayName === persisted.displayName;
    case "labels":
      return labelsEqual(
        labelsToEntries(current.labels),
        labelsToEntries(persisted.labels)
      );
    case "config.host":
      return current.config?.host === (persisted.config?.host ?? "");
    case "config.port":
      return (
        current.config?.port ===
        (persisted.config?.port ?? DEFAULT_POSTGRES_PORT)
      );
    case "config.database":
      return current.config?.database === (persisted.config?.database ?? "");
    case "config.username":
      return current.config?.username === (persisted.config?.username ?? "");
    case "config.password":
      return false;
    case "config.ssl_mode":
      return (
        current.config?.sslMode ===
        (persisted.config?.sslMode ?? PostgresConfig_SslMode.PREFER)
      );
    case "config.ssl_negotiation":
      return (
        current.config?.sslNegotiation ===
        normalizeSslNegotiation(persisted.config?.sslNegotiation)
      );
    default:
      return true;
  }
}

function createInstanceUpdate(
  form: InstanceProtoForm,
  persisted: InstanceRecord
) {
  const instance = form.createMessage();
  const changedPaths = form
    .createUpdateMask()
    .paths.filter((path) => !valuesEqual(path, instance, persisted));
  const repairsUnreadableCredentials =
    persisted.credentialState === Instance_CredentialState.UNREADABLE &&
    changedPaths.includes("config.password");
  const updatePaths = repairsUnreadableCredentials
    ? [...new Set(changedPaths.map(widenConfigPath))]
    : changedPaths;
  return { instance, updatePaths };
}

function widenConfigPath(path: string) {
  return path.startsWith("config.") ? "config" : path;
}

function findFirstErrorMessage(value: unknown): string | undefined {
  if (!(value && typeof value === "object")) {
    return;
  }
  if (
    "message" in value &&
    typeof (value as { message?: unknown }).message === "string"
  ) {
    return (value as { message: string }).message;
  }
  for (const child of Object.values(value)) {
    const message = findFirstErrorMessage(child);
    if (message) {
      return message;
    }
  }
  return undefined;
}

export type { InstanceProtoForm };
export {
  createInstanceFormDefaults,
  createInstanceUpdate,
  findFirstErrorMessage,
  normalizeInstanceProtoForm,
};
