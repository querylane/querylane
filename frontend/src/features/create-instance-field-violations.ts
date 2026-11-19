import { ConnectError } from "@connectrpc/connect";
import { isNonEmptyString } from "@/lib/value-guards";
import { BadRequestSchema } from "@/protogen/google/rpc/error_details_pb";
import type {
  CreateInstanceFormErrors,
  CreateInstanceInvalidFieldName,
} from "@/routes/new-instance-validation";

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

const RESOURCE_BODY_PREFIX_PATTERN = /^(?:spec|instance)\./u;

type ConnectionConfigFieldName =
  | "database"
  | "host"
  | "password"
  | "port"
  | "sslMode"
  | "sslNegotiation"
  | "username";

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

function recordFieldViolation<FieldName extends string>({
  fieldErrors,
  generalErrors,
  mapField,
  violation,
}: {
  fieldErrors: Partial<Record<FieldName, string>>;
  generalErrors: string[];
  mapField: (field: string) => FieldName | null;
  violation: { description: string; field: string };
}) {
  const formField = mapField(violation.field);
  const description = violation.description || "Invalid value.";
  if (isNonEmptyString(formField)) {
    fieldErrors[formField] = [fieldErrors[formField], description]
      .filter(Boolean)
      .join("\n");
    return;
  }
  generalErrors.push(
    violation.field ? `${violation.field}: ${description}` : description
  );
}

function extractBadRequestFieldViolations<FieldName extends string>({
  error,
  focusOrder,
  mapField,
}: {
  error: unknown;
  focusOrder: readonly FieldName[];
  mapField: (field: string) => FieldName | null;
}) {
  const fieldErrors: Partial<Record<FieldName, string>> = {};
  const generalErrors: string[] = [];
  const connectError = ConnectError.from(error);
  for (const badRequest of connectError.findDetails(BadRequestSchema)) {
    for (const violation of badRequest.fieldViolations) {
      recordFieldViolation({ fieldErrors, generalErrors, mapField, violation });
    }
  }

  return {
    fieldErrors,
    firstInvalidField:
      focusOrder.find((field) => Boolean(fieldErrors[field])) ?? null,
    generalErrors,
  } satisfies FieldViolationExtractionResult<FieldName>;
}

function mapViolationFieldToFormField(field: string) {
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
function extractCreateInstanceFieldViolations(error: unknown) {
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
  } satisfies CreateInstanceFieldViolationResult;
}

export type { CreateInstanceFieldViolationResult };
export { extractCreateInstanceFieldViolations };
