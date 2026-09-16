import { create as createProto } from "@bufbuild/protobuf";
import type { FieldError } from "react-hook-form";
import type {
  CreateInstanceFormState,
  CreateInstanceLabel,
} from "@/features/new-instance-workflow";
import type { UseProtoFormReturn } from "@/hooks/use-proto-form";
import {
  formatSslMode,
  formatSslNegotiation,
  toSslMode,
  toSslNegotiation,
} from "@/lib/protobuf-enums";
import {
  CreateInstanceSpecSchema,
  PostgresConfigSchema,
} from "@/protogen/querylane/console/v1alpha1/instance_pb";
import type {
  CreateInstanceFieldName,
  CreateInstanceFormErrors,
  CreateInstanceInvalidFieldName,
} from "@/routes/new-instance-validation";
import { validateCreateInstanceForm } from "@/routes/new-instance-validation";

type CreateInstanceProtoForm = UseProtoFormReturn<
  typeof CreateInstanceSpecSchema
>;

const FOCUS_ORDER = [
  "displayName",
  "host",
  "port",
  "database",
  "username",
  "password",
  "sslNegotiation",
  "instanceId",
  "labels",
] as const satisfies readonly CreateInstanceInvalidFieldName[];

function labelsToMap(labels: CreateInstanceLabel[]): Record<string, string> {
  const entries: [string, string][] = [];
  for (const label of labels) {
    const key = label.key.trim();
    if (key.length > 0) {
      entries.push([key, label.value]);
    }
  }
  return Object.fromEntries(entries);
}

function createCreateInstanceDefaultValues(formState: CreateInstanceFormState) {
  return createProto(CreateInstanceSpecSchema, {
    config: createProto(PostgresConfigSchema, {
      database: formState.database,
      host: formState.host,
      password: formState.password,
      port: Number(formState.port),
      sslMode: toSslMode(formState.sslMode),
      sslNegotiation: toSslNegotiation(formState.sslNegotiation),
      username: formState.username,
    }),
    displayName: formState.displayName,
    labels: labelsToMap(formState.labels),
  });
}

function readCreateInstanceFormState({
  form,
  instanceId,
  labels,
}: {
  form: CreateInstanceProtoForm;
  instanceId: string;
  labels: CreateInstanceLabel[];
}): CreateInstanceFormState {
  const values = form.getValues();
  return {
    database: values.config?.database ?? "",
    displayName: values.displayName,
    host: values.config?.host ?? "",
    instanceId,
    labels,
    password: values.config?.password ?? "",
    port: values.config?.port ? String(values.config.port) : "",
    sslMode: formatSslMode(values.config?.sslMode ?? 0),
    sslNegotiation: formatSslNegotiation(values.config?.sslNegotiation ?? 0),
    username: values.config?.username ?? "",
  };
}

function setCreateInstanceProtoField(
  form: CreateInstanceProtoForm,
  field: CreateInstanceFieldName,
  value: string
) {
  const options = {
    shouldDirty: true,
    shouldTouch: true,
    shouldValidate: false,
  } as const;
  switch (field) {
    case "displayName":
      form.setValue("displayName", value, options);
      break;
    case "database":
      form.setValue("config.database", value, options);
      break;
    case "host":
      form.setValue("config.host", value, options);
      break;
    case "password":
      form.setValue("config.password", value, options);
      break;
    case "sslMode":
      form.setValue("config.sslMode", toSslMode(value), options);
      break;
    case "sslNegotiation":
      form.setValue("config.sslNegotiation", toSslNegotiation(value), options);
      break;
    case "username":
      form.setValue("config.username", value, options);
      break;
    case "port":
      form.setValue("config.port", Number(value), options);
      break;
    case "instanceId":
      break;
    default: {
      const unsupportedField: never = field;
      throw new Error(`Unsupported create-instance field: ${unsupportedField}`);
    }
  }
}

function clearCreateInstanceProtoError(
  form: CreateInstanceProtoForm,
  field: CreateInstanceFieldName
) {
  switch (field) {
    case "displayName":
      form.clearErrors("displayName");
      break;
    case "database":
      form.clearErrors("config.database");
      break;
    case "host":
      form.clearErrors("config.host");
      break;
    case "password":
      form.clearErrors("config.password");
      break;
    case "port":
      form.clearErrors("config.port");
      break;
    case "sslMode":
      form.clearErrors("config.sslMode");
      break;
    case "sslNegotiation":
      form.clearErrors("config.sslNegotiation");
      break;
    case "username":
      form.clearErrors("config.username");
      break;
    case "instanceId":
      break;
    default: {
      const unsupportedField: never = field;
      throw new Error(`Unsupported create-instance field: ${unsupportedField}`);
    }
  }
}

function errorMessage(error: FieldError | undefined): string | undefined {
  return typeof error?.message === "string" ? error.message : undefined;
}

function getCreateInstanceProtoErrors(
  form: CreateInstanceProtoForm,
  supplementalErrors: CreateInstanceFormErrors
): CreateInstanceFormErrors {
  const { errors } = form.formState;
  const protoErrors: CreateInstanceFormErrors = {};
  const include = (
    field: CreateInstanceInvalidFieldName,
    error: FieldError | undefined
  ) => {
    const message = errorMessage(error);
    if (message) {
      protoErrors[field] = message;
    }
  };
  include("database", errors.config?.database);
  include("displayName", errors.displayName);
  include("host", errors.config?.host);
  include("password", errors.config?.password);
  include("port", errors.config?.port);
  include("sslMode", errors.config?.sslMode);
  include("sslNegotiation", errors.config?.sslNegotiation);
  include("username", errors.config?.username);
  return { ...protoErrors, ...supplementalErrors };
}

function syncCreateInstanceProtoValues(
  form: CreateInstanceProtoForm,
  formState: CreateInstanceFormState
) {
  const options = {
    shouldDirty: true,
    shouldTouch: false,
    shouldValidate: false,
  } as const;
  form.setValue("displayName", formState.displayName.trim(), options);
  form.setValue("config.host", formState.host.trim(), options);
  form.setValue("config.port", Number(formState.port.trim()) || 0, options);
  form.setValue("config.database", formState.database.trim(), options);
  form.setValue("config.username", formState.username.trim(), options);
  form.setValue("config.password", formState.password, options);
  form.setValue("labels", labelsToMap(formState.labels), options);
}

async function validateCreateInstanceProtoForm(
  form: CreateInstanceProtoForm,
  formState: CreateInstanceFormState
) {
  syncCreateInstanceProtoValues(form, formState);
  await form.trigger();

  const friendlyErrors = validateCreateInstanceForm(formState).errors;
  const errors: CreateInstanceFormErrors = { ...friendlyErrors };
  const fieldErrors = form.formState.errors;
  const include = (
    field: CreateInstanceInvalidFieldName,
    error: FieldError | undefined
  ) => {
    const message = friendlyErrors[field] ?? errorMessage(error);
    if (!errors[field] && error && message) {
      errors[field] = message;
    }
  };
  include("displayName", fieldErrors.displayName);
  include("host", fieldErrors.config?.host);
  include("port", fieldErrors.config?.port);
  include("database", fieldErrors.config?.database);
  include("username", fieldErrors.config?.username);
  include("password", fieldErrors.config?.password);
  include("sslMode", fieldErrors.config?.sslMode);
  include("sslNegotiation", fieldErrors.config?.sslNegotiation);

  return {
    errors,
    firstInvalidField: FOCUS_ORDER.find((field) => errors[field]) ?? null,
  };
}

export type { CreateInstanceProtoForm };
export {
  clearCreateInstanceProtoError,
  createCreateInstanceDefaultValues,
  getCreateInstanceProtoErrors,
  labelsToMap,
  readCreateInstanceFormState,
  setCreateInstanceProtoField,
  validateCreateInstanceProtoForm,
};
