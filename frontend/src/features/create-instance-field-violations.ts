import { ConnectError } from "@connectrpc/connect";
import type {
  InstanceFormErrors,
  InstanceFormInvalidFieldName,
} from "@/components/console-pages/instance-config-model";
import { BadRequestSchema } from "@/protogen/google/rpc/error_details_pb";
import type {
  CreateInstanceFormErrors,
  CreateInstanceInvalidFieldName,
} from "@/routes/new-instance-validation";

/**
 * Focus order for server-reported violations. Mirrors the client-side focus
 * order and appends the fields only the server validates.
 */
const SERVER_FIELD_FOCUS_ORDER = [
  "displayName",
  "host",
  "port",
  "database",
  "username",
  "password",
  "sslMode",
  "sslNegotiation",
  "instanceId",
  "labels",
] as const satisfies readonly CreateInstanceInvalidFieldName[];

// CreateInstanceRequest wraps client-settable fields in `spec` (or the legacy
// `instance` body). Violations point at the request shape, the form does not.
const RESOURCE_BODY_PREFIX_PATTERN = /^(?:spec|instance)\./;

type ConnectionConfigFieldName = Extract<
  CreateInstanceInvalidFieldName,
  InstanceFormInvalidFieldName
>;

const CONFIG_FIELD_BY_PATH: Partial<Record<string, ConnectionConfigFieldName>> =
  {
    "config.database": "database",
    "config.host": "host",
    "config.password": "password",
    "config.port": "port",
    "config.ssl_mode": "sslMode",
    "config.ssl_negotiation": "sslNegotiation",
    "config.sslMode": "sslMode",
    "config.sslNegotiation": "sslNegotiation",
    "config.username": "username",
  };

interface FieldViolationExtractionResult<FieldName extends string> {
  fieldErrors: Partial<Record<FieldName, string>>;
  firstInvalidField: FieldName | null;
  generalErrors: string[];
}

function extractBadRequestFieldViolations<FieldName extends string>({
  error,
  focusOrder,
  mapField,
}: {
  error: unknown;
  focusOrder: readonly FieldName[];
  mapField: (field: string) => FieldName | null;
}): FieldViolationExtractionResult<FieldName> {
  const fieldErrors: Partial<Record<FieldName, string>> = {};
  const generalErrors: string[] = [];
  const connectError = ConnectError.from(error);
  for (const badRequest of connectError.findDetails(BadRequestSchema)) {
    for (const violation of badRequest.fieldViolations) {
      const formField = mapField(violation.field);
      const description = violation.description || "Invalid value.";
      if (formField) {
        if (!fieldErrors[formField]) {
          fieldErrors[formField] = description;
        }
        continue;
      }
      generalErrors.push(
        violation.field ? `${violation.field}: ${description}` : description
      );
    }
  }

  return {
    fieldErrors,
    firstInvalidField: focusOrder.find((field) => fieldErrors[field]) ?? null,
    generalErrors,
  };
}

function mapViolationFieldToFormField(
  field: string
): CreateInstanceInvalidFieldName | null {
  const path = field.replace(RESOURCE_BODY_PREFIX_PATTERN, "");
  if (path === "display_name" || path === "displayName") {
    return "displayName";
  }
  if (path === "instance_id" || path === "instanceId") {
    return "instanceId";
  }
  if (
    path === "labels" ||
    path.startsWith("labels.") ||
    path.startsWith("labels[")
  ) {
    return "labels";
  }
  return CONFIG_FIELD_BY_PATH[path] ?? null;
}

interface CreateInstanceFieldViolationResult {
  fieldErrors: CreateInstanceFormErrors;
  firstInvalidField: CreateInstanceInvalidFieldName | null;
  generalErrors: string[];
}

/**
 * Map google.rpc.BadRequest field violations from a create-instance error
 * onto per-field form errors. Violations that do not correspond to a form
 * field are left for the caller's inline notice.
 */
function extractCreateInstanceFieldViolations(
  error: unknown
): CreateInstanceFieldViolationResult {
  const result =
    extractBadRequestFieldViolations<CreateInstanceInvalidFieldName>({
      error,
      focusOrder: SERVER_FIELD_FOCUS_ORDER,
      mapField: mapViolationFieldToFormField,
    });

  return {
    fieldErrors: result.fieldErrors,
    firstInvalidField: result.firstInvalidField,
    generalErrors: result.generalErrors,
  };
}

const INSTANCE_CONFIG_FIELD_FOCUS_ORDER = [
  "displayName",
  "host",
  "port",
  "database",
  "username",
  "password",
  "sslMode",
  "sslNegotiation",
  "labels",
] as const satisfies readonly InstanceFormInvalidFieldName[];

function mapViolationFieldToInstanceConfigField(
  field: string
): InstanceFormInvalidFieldName | null {
  const path = field.replace(RESOURCE_BODY_PREFIX_PATTERN, "");
  if (path === "display_name" || path === "displayName") {
    return "displayName";
  }
  if (
    path === "labels" ||
    path.startsWith("labels.") ||
    path.startsWith("labels[")
  ) {
    return "labels";
  }
  return CONFIG_FIELD_BY_PATH[path] ?? null;
}

interface InstanceConfigFieldViolationResult {
  fieldErrors: InstanceFormErrors;
  firstInvalidField: InstanceFormInvalidFieldName | null;
  generalErrors: string[];
}

function extractInstanceConfigFieldViolations(
  error: unknown
): InstanceConfigFieldViolationResult {
  const result = extractBadRequestFieldViolations<InstanceFormInvalidFieldName>(
    {
      error,
      focusOrder: INSTANCE_CONFIG_FIELD_FOCUS_ORDER,
      mapField: mapViolationFieldToInstanceConfigField,
    }
  );

  return {
    fieldErrors: result.fieldErrors,
    firstInvalidField: result.firstInvalidField,
    generalErrors: result.generalErrors,
  };
}

export type {
  CreateInstanceFieldViolationResult,
  InstanceConfigFieldViolationResult,
};
export {
  extractCreateInstanceFieldViolations,
  extractInstanceConfigFieldViolations,
};
