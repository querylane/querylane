import {
  clone,
  create,
  type DescField,
  type DescMessage,
  fromJson,
  fromJsonString,
  isMessage,
  type JsonValue,
  type MessageInitShape,
  type MessageShape,
  type MessageValidType,
  ScalarType,
  toJson,
  toJsonString,
} from "@bufbuild/protobuf";
import { base64Decode, base64Encode } from "@bufbuild/protobuf/wire";
import {
  DurationSchema,
  type FieldMask,
  isWrapperDesc,
  ListValueSchema,
  StructSchema,
  type TimestampSchema,
  timestampDate,
  timestampFromDate,
  ValueSchema,
} from "@bufbuild/protobuf/wkt";
import type { ValidatorOptions } from "@bufbuild/protovalidate";
import type { EmptyRepeatedStringPolicy, FormValues, StandardSchemaV1 } from "../core/index.js";
import type { ProtoformMessageFormatter } from "../core/messages.js";
import {
  ANY_TYPE,
  cloneField,
  DURATION_TYPE,
  FIELD_MASK_TYPE,
  is64BitScalar,
  LIST_VALUE_TYPE,
  type ListField,
  type MapField,
  type MessageField,
  type ScalarField,
  STRUCT_TYPE,
  TIMESTAMP_TYPE,
  tracksPresence,
  VALUE_TYPE,
} from "./descriptor-utils.js";
import { protoPathToFormPath } from "./proto-error-path.js";

const PROTO_JSON_FALLBACK_TYPES = [
  TIMESTAMP_TYPE,
  DURATION_TYPE,
  FIELD_MASK_TYPE,
  STRUCT_TYPE,
  VALUE_TYPE,
  LIST_VALUE_TYPE,
  ANY_TYPE,
];

export const PROTO_FORM_ROOT_ERROR_KEY = "__protoFormRoot__";

type SchemaIssue = StandardSchemaV1.Issue;
type AnyObject = Record<string, unknown>;

export interface ProtoAnyFormValue {
  typeUrl?: string;
  valueBase64?: string;
}

export interface ProtoMapFormEntry {
  key: unknown;
  value: unknown;
}

export interface ProtoConversionOptions {
  /**
   * Per-field policies keyed by descriptor path. Empty and whitespace-only
   * repeated strings are discarded unless the field is set to `preserve`.
   */
  emptyRepeatedStringPolicies?: Readonly<Record<string, EmptyRepeatedStringPolicy>> | undefined;
}

export interface ProtoFormOptions extends ValidatorOptions, ProtoConversionOptions {
  formatMessage?: ProtoformMessageFormatter | undefined;
}

function isPlainObject(value: unknown): value is Record<string, unknown> {
  return Boolean(value && typeof value === "object" && !Array.isArray(value));
}

function toDateTimeLocalValue(timestamp: MessageShape<typeof TimestampSchema> | undefined): string | undefined {
  if (!timestamp) {
    return;
  }

  const date = timestampDate(timestamp);
  if (Number.isNaN(date.getTime())) {
    return;
  }

  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, "0");
  const day = String(date.getDate()).padStart(2, "0");
  const hours = String(date.getHours()).padStart(2, "0");
  const minutes = String(date.getMinutes()).padStart(2, "0");

  return `${year}-${month}-${day}T${hours}:${minutes}`;
}

function objectHasValues(value: Record<string, unknown>): boolean {
  return Object.values(value).some((entry) => {
    if (entry === undefined || entry === null) {
      return false;
    }
    if (typeof entry === "string") {
      return entry.trim().length > 0;
    }
    if (Array.isArray(entry)) {
      return entry.length > 0;
    }
    if (typeof entry === "object") {
      return isPlainObject(entry) ? objectHasValues(entry) : true;
    }
    return true;
  });
}

function isJsonValue(value: unknown): value is JsonValue {
  if (value === null || typeof value === "string" || typeof value === "boolean") {
    return true;
  }
  if (typeof value === "number") {
    return Number.isFinite(value);
  }
  if (Array.isArray(value)) {
    return value.every(isJsonValue);
  }
  return isPlainObject(value) && Object.values(value).every(isJsonValue);
}

function fieldToFormValue(field: DescField, value: unknown): unknown {
  switch (field.fieldKind) {
    case "scalar": {
      if (field.scalar === ScalarType.BYTES) {
        return value instanceof Uint8Array ? base64Encode(value) : undefined;
      }
      if (is64BitScalar(field.scalar)) {
        return typeof value === "bigint" ? value.toString() : (value ?? undefined);
      }
      return value;
    }
    case "enum":
      return value;
    case "message": {
      if (isWrapperDesc(field.message)) {
        const wrappedScalar = field.message.fields[0]?.scalar;
        if (wrappedScalar === ScalarType.BYTES) {
          return value instanceof Uint8Array ? base64Encode(value) : undefined;
        }
        if (is64BitScalar(wrappedScalar)) {
          return typeof value === "bigint" ? value.toString() : (value ?? undefined);
        }
        return value;
      }

      switch (field.message.typeName) {
        case TIMESTAMP_TYPE:
          return toDateTimeLocalValue(value as MessageShape<typeof TimestampSchema> | undefined);
        case DURATION_TYPE:
          return value
            ? toJsonString(DurationSchema, value as MessageShape<typeof DurationSchema>).replace(/"/gu, "")
            : undefined;
        case FIELD_MASK_TYPE:
          return isPlainObject(value) && Array.isArray((value as { paths?: unknown[] }).paths)
            ? (value as { paths: string[] }).paths
            : undefined;
        case STRUCT_TYPE:
          if (isMessage(value, StructSchema)) {
            return toJson(StructSchema, value);
          }
          return isPlainObject(value) && isJsonValue(value) ? structuredClone(value) : undefined;
        case VALUE_TYPE:
          if (isMessage(value, ValueSchema)) {
            return toJson(ValueSchema, value);
          }
          return isJsonValue(value) ? structuredClone(value) : undefined;
        case LIST_VALUE_TYPE:
          if (isMessage(value, ListValueSchema)) {
            return toJson(ListValueSchema, value);
          }
          return Array.isArray(value) && isJsonValue(value) ? structuredClone(value) : undefined;
        case ANY_TYPE:
          return value && isPlainObject(value)
            ? {
                typeUrl:
                  typeof (value as { typeUrl?: unknown }).typeUrl === "string"
                    ? (value as { typeUrl: string }).typeUrl
                    : "",
                valueBase64:
                  (value as { value?: unknown }).value instanceof Uint8Array
                    ? base64Encode((value as { value: Uint8Array }).value)
                    : "",
              }
            : undefined;
        default:
          return value ? messageToFormValues(field.message, value as AnyObject) : undefined;
      }
    }
    case "list":
      return Array.isArray(value) ? value.map((item) => listItemToFormValue(field, item)) : [];
    case "map": {
      if (!isPlainObject(value)) {
        return [];
      }
      return Object.entries(value).map(
        ([key, entryValue]) =>
          ({
            key: mapKeyToFormValue(field, key),
            value: mapValueToFormValue(field, entryValue),
          }) satisfies ProtoMapFormEntry
      );
    }
    default:
      return value;
  }
}

function listItemToFormValue(field: ListField, value: unknown): unknown {
  if (field.listKind === "message" && value) {
    if (isWrapperDesc(field.message)) {
      return value;
    }
    return messageToFormValues(field.message, value as AnyObject);
  }

  if (field.listKind === "scalar" && field.scalar === ScalarType.BYTES) {
    return value instanceof Uint8Array ? base64Encode(value) : undefined;
  }

  if (field.listKind === "scalar" && is64BitScalar(field.scalar)) {
    return typeof value === "bigint" ? value.toString() : value;
  }

  return value;
}

function mapValueToFormValue(field: MapField, value: unknown): unknown {
  if (field.mapKind === "message" && value) {
    if (isWrapperDesc(field.message)) {
      return value;
    }
    return messageToFormValues(field.message, value as AnyObject);
  }

  if (field.mapKind === "scalar" && field.scalar === ScalarType.BYTES) {
    return value instanceof Uint8Array ? base64Encode(value) : undefined;
  }

  if (field.mapKind === "scalar" && is64BitScalar(field.scalar)) {
    return typeof value === "bigint" ? value.toString() : value;
  }

  return value;
}

function mapKeyToFormValue(field: MapField, key: string): string | number | boolean {
  if (field.mapKey === ScalarType.BOOL) {
    return key === "true";
  }
  if (is64BitScalar(field.mapKey) || field.mapKey === ScalarType.STRING) {
    return key;
  }
  return Number(key);
}

function messageToFormValues(desc: DescMessage, value: AnyObject): Record<string, unknown> {
  const result: Record<string, unknown> = {};

  for (const member of desc.members) {
    if (member.kind === "oneof") {
      const oneofValue = value[member.localName] as { case?: string; value?: unknown } | undefined;
      if (!oneofValue?.case) {
        result[member.localName] = { case: undefined, value: undefined };
        continue;
      }

      const activeField = member.fields.find((field) => field.localName === oneofValue.case);
      result[member.localName] = {
        case: oneofValue.case,
        value: activeField ? fieldToFormValue(activeField, oneofValue.value) : oneofValue.value,
      };
      continue;
    }

    result[member.localName] = fieldToFormValue(member, value[member.localName]);
  }

  return result;
}

export function protoToFormValues<Desc extends DescMessage>(
  desc: Desc,
  value?: MessageShape<Desc>
): Record<string, unknown> {
  const baseValue = (value ?? create(desc)) as AnyObject;
  return messageToFormValues(desc, baseValue);
}

function normalizeBooleanValue(value: unknown): boolean | undefined {
  if (value === undefined || value === null || value === "") {
    return;
  }
  if (typeof value === "boolean") {
    return value;
  }
  if (value === "true") {
    return true;
  }
  if (value === "false") {
    return false;
  }
  return Boolean(value);
}

function normalizeNumberValue(value: unknown): number | undefined {
  if (value === undefined || value === null || value === "") {
    return;
  }
  if (typeof value === "number") {
    return Number.isNaN(value) ? undefined : value;
  }
  const parsed = Number(value);
  return Number.isNaN(parsed) ? undefined : parsed;
}

function normalizeFloatingPointValue(value: unknown): number | undefined {
  if (value === undefined || value === null || value === "") {
    return;
  }
  if (typeof value === "number") {
    return value;
  }
  if (value === "NaN") {
    return Number.NaN;
  }
  const parsed = Number(value);
  return Number.isNaN(parsed) ? undefined : parsed;
}

function normalizeBigIntValue(value: unknown): bigint | undefined {
  if (value === undefined || value === null || value === "") {
    return;
  }
  if (typeof value === "bigint") {
    return value;
  }
  if (typeof value === "number" && Number.isSafeInteger(value)) {
    return BigInt(value);
  }
  if (typeof value === "string") {
    try {
      return BigInt(value);
    } catch {
      return;
    }
  }
  return;
}

function normalizeScalarValue(field: DescField, value: unknown): unknown {
  if (field.scalar === ScalarType.STRING) {
    if (typeof value === "string") {
      return value;
    }

    if (value === undefined || value === null) {
      return;
    }

    return String(value);
  }
  if (field.scalar === ScalarType.BOOL) {
    return normalizeBooleanValue(value);
  }
  if (field.scalar === ScalarType.BYTES) {
    if (typeof value === "string") {
      return base64Decode(value);
    }

    return value instanceof Uint8Array ? value : undefined;
  }
  if (field.scalar === ScalarType.FLOAT || field.scalar === ScalarType.DOUBLE) {
    return normalizeFloatingPointValue(value);
  }
  if (is64BitScalar(field.scalar)) {
    return normalizeBigIntValue(value);
  }
  return normalizeNumberValue(value);
}

function normalizeMessageFieldValue(
  field: MessageField,
  value: unknown,
  options: ProtoConversionOptions,
  path: readonly string[]
): unknown {
  if (isWrapperDesc(field.message)) {
    const wrappedScalar = field.message.fields[0]?.scalar;
    const wrappedField = cloneField(field, {
      fieldKind: "scalar",
      scalar: wrappedScalar,
    });
    return normalizeScalarValue(wrappedField, value);
  }

  switch (field.message.typeName) {
    case TIMESTAMP_TYPE:
      return typeof value === "string" && value ? timestampFromDate(new Date(value)) : undefined;
    case DURATION_TYPE:
      return typeof value === "string" && value ? fromJsonString(DurationSchema, JSON.stringify(value)) : undefined;
    case FIELD_MASK_TYPE:
      return Array.isArray(value) && value.length > 0
        ? {
            paths: value.filter((entry): entry is string => typeof entry === "string"),
          }
        : undefined;
    case STRUCT_TYPE:
      return value === undefined ? undefined : fromJson(StructSchema, (value ?? {}) as JsonValue);
    case VALUE_TYPE:
      return value === undefined ? undefined : fromJson(ValueSchema, value as JsonValue);
    case LIST_VALUE_TYPE:
      return value === undefined ? undefined : fromJson(ListValueSchema, value as JsonValue);
    case ANY_TYPE: {
      const anyValue = isPlainObject(value) ? (value as ProtoAnyFormValue) : undefined;
      if (!(anyValue?.typeUrl || anyValue?.valueBase64)) {
        return;
      }
      return {
        typeUrl: anyValue?.typeUrl ?? "",
        value: base64Decode(anyValue?.valueBase64 ?? ""),
      };
    }
    default: {
      const nested = isPlainObject(value) ? messageToProtoInit(field.message, value, options, path) : undefined;
      if (!(nested && objectHasValues(nested))) {
        return tracksPresence(field) ? undefined : nested;
      }
      return nested;
    }
  }
}

function listItemToProtoValue(
  field: ListField,
  value: unknown,
  options: ProtoConversionOptions,
  path: readonly string[]
): unknown {
  if (field.listKind === "scalar") {
    return normalizeScalarValue(
      cloneField(field, {
        fieldKind: "scalar",
        oneof: undefined,
      }),
      value
    );
  }
  if (field.listKind === "enum") {
    return value === undefined || value === "" ? undefined : Number(value);
  }
  if (isWrapperDesc(field.message)) {
    return value;
  }
  return isPlainObject(value) ? messageToProtoInit(field.message, value, options, path) : undefined;
}

function mapValueToProtoValue(
  field: MapField,
  value: unknown,
  options: ProtoConversionOptions,
  path: readonly string[]
): unknown {
  if (field.mapKind === "scalar") {
    return normalizeScalarValue(
      cloneField(field, {
        fieldKind: "scalar",
        oneof: undefined,
      }),
      value
    );
  }
  if (field.mapKind === "enum") {
    return value === undefined || value === "" ? undefined : Number(value);
  }
  if (isWrapperDesc(field.message)) {
    return value;
  }
  return isPlainObject(value) ? messageToProtoInit(field.message, value, options, path) : undefined;
}

function repeatedListEntries(
  field: ListField,
  value: unknown,
  options: ProtoConversionOptions,
  path: readonly string[]
): unknown[] {
  if (!Array.isArray(value)) {
    return [];
  }
  const policy = options.emptyRepeatedStringPolicies?.[path.join(".")];
  if (field.listKind !== "scalar" || field.scalar !== ScalarType.STRING || policy === "preserve") {
    return value;
  }
  return value.filter((entry) => typeof entry !== "string" || entry.trim().length > 0);
}

function fieldToProtoValue(
  field: DescField,
  value: unknown,
  options: ProtoConversionOptions,
  path: readonly string[]
): unknown {
  switch (field.fieldKind) {
    case "scalar":
      return normalizeScalarValue(field, value);
    case "enum":
      return value === undefined || value === "" ? undefined : Number(value);
    case "message":
      return normalizeMessageFieldValue(field, value, options, path);
    case "list":
      return repeatedListEntries(field, value, options, path).map((entry) =>
        listItemToProtoValue(field, entry, options, path)
      );
    case "map": {
      const entries = isPlainObject(value)
        ? Object.entries(value).map(([key, mapValue]) => ({ key, value: mapValue }))
        : value;
      return Array.isArray(entries)
        ? Object.fromEntries(
            entries
              .map((entry) => {
                if (!isPlainObject(entry)) {
                  return null;
                }
                const mapKey = entry["key"];
                if (mapKey === undefined || mapKey === null || mapKey === "") {
                  return null;
                }
                return [String(mapKey), mapValueToProtoValue(field, entry["value"], options, path)] as const;
              })
              .filter((entry): entry is readonly [string, unknown] => entry !== null)
          )
        : {};
    }
    default:
      return value;
  }
}

function messageToProtoInit(
  desc: DescMessage,
  value: AnyObject,
  options: ProtoConversionOptions,
  path: readonly string[]
): Record<string, unknown> {
  const result: Record<string, unknown> = {};

  for (const member of desc.members) {
    if (member.kind === "oneof") {
      const oneofValue = value[member.localName] as { case?: string; value?: unknown } | undefined;
      if (!oneofValue?.case) {
        continue;
      }

      const activeField = member.fields.find((field) => field.localName === oneofValue.case);
      if (!activeField) {
        continue;
      }

      result[member.localName] = {
        case: oneofValue.case,
        value: fieldToProtoValue(activeField, oneofValue.value, options, [
          ...path,
          member.localName,
          activeField.localName,
        ]),
      };
      continue;
    }

    const normalized = fieldToProtoValue(member, value[member.localName], options, [...path, member.localName]);
    if (normalized === undefined && tracksPresence(member)) {
      continue;
    }
    result[member.localName] = normalized;
  }

  return result;
}

export function formValuesToProtoInit<Desc extends DescMessage>(
  desc: Desc,
  values: Record<string, unknown>,
  options: ProtoConversionOptions = {}
): MessageInitShape<Desc> {
  return messageToProtoInit(desc, values, options, []) as MessageInitShape<Desc>;
}

function knownMessageValuesEqual(desc: DescMessage, left: AnyObject, right: AnyObject): boolean {
  return toJsonString(desc, left as never) === toJsonString(desc, right as never);
}

function preserveRepeatedMessageUnknownFields(desc: DescMessage, target: unknown[], source: unknown[]): void {
  const matchedSourceIndexes = new Set<number>();
  const matchedTargetIndexes = new Set<number>();

  for (const [targetIndex, targetValue] of target.entries()) {
    if (!isPlainObject(targetValue)) {
      continue;
    }
    const candidates = source.flatMap((candidateSourceValue, candidateSourceIndex) =>
      !matchedSourceIndexes.has(candidateSourceIndex) &&
      isPlainObject(candidateSourceValue) &&
      knownMessageValuesEqual(desc, targetValue, candidateSourceValue)
        ? [candidateSourceIndex]
        : []
    );
    if (candidates.length !== 1) {
      continue;
    }
    const [sourceIndex] = candidates;
    if (sourceIndex === undefined) {
      continue;
    }
    const sourceValue = source[sourceIndex];
    if (!isPlainObject(sourceValue)) {
      continue;
    }
    const competingTargetCount = target.filter(
      (candidate, candidateIndex) =>
        !matchedTargetIndexes.has(candidateIndex) &&
        isPlainObject(candidate) &&
        knownMessageValuesEqual(desc, candidate, sourceValue)
    ).length;
    if (competingTargetCount !== 1) {
      continue;
    }
    preserveMessageUnknownFields(desc, targetValue, sourceValue);
    matchedSourceIndexes.add(sourceIndex);
    matchedTargetIndexes.add(targetIndex);
  }

  if (target.length !== source.length) {
    return;
  }

  for (const [index, targetValue] of target.entries()) {
    const sourceValue = source[index];
    if (
      matchedTargetIndexes.has(index) ||
      matchedSourceIndexes.has(index) ||
      !isPlainObject(targetValue) ||
      !isPlainObject(sourceValue)
    ) {
      continue;
    }
    preserveMessageUnknownFields(desc, targetValue, sourceValue);
  }
}

function preserveFieldUnknownFields(field: DescField, target: unknown, source: unknown): void {
  switch (field.fieldKind) {
    case "message":
      if (isPlainObject(target) && isPlainObject(source)) {
        preserveMessageUnknownFields(field.message, target, source);
      }
      return;
    case "list":
      if (field.listKind === "message" && Array.isArray(target) && Array.isArray(source)) {
        preserveRepeatedMessageUnknownFields(field.message, target, source);
      }
      return;
    case "map":
      if (field.mapKind === "message" && isPlainObject(target) && isPlainObject(source)) {
        for (const [key, targetValue] of Object.entries(target)) {
          const sourceValue = source[key];
          if (isPlainObject(targetValue) && isPlainObject(sourceValue)) {
            preserveMessageUnknownFields(field.message, targetValue, sourceValue);
          }
        }
      }
      return;
    case "enum":
    case "scalar":
      return;
    default:
      throw new TypeError(`Unsupported field: ${String(field satisfies never)}`);
  }
}

function preserveMessageUnknownFields(desc: DescMessage, target: AnyObject, source: AnyObject): void {
  if (source["$unknown"]) {
    target["$unknown"] = structuredClone(source["$unknown"]);
  }

  for (const member of desc.members) {
    if (member.kind === "oneof") {
      const targetOneof = target[member.localName];
      const sourceOneof = source[member.localName];
      if (!(isPlainObject(targetOneof) && isPlainObject(sourceOneof))) {
        continue;
      }
      const targetCase = targetOneof["case"];
      if (typeof targetCase !== "string" || targetCase !== sourceOneof["case"]) {
        continue;
      }
      const activeField = member.fields.find((field) => field.localName === targetCase);
      if (activeField) {
        preserveFieldUnknownFields(activeField, targetOneof["value"], sourceOneof["value"]);
      }
      continue;
    }

    preserveFieldUnknownFields(member, target[member.localName], source[member.localName]);
  }
}

/**
 * Returns a validated protobuf message with unknown wire fields restored from
 * the corresponding surviving nodes in its edit source. The target is cloned
 * when a source is present.
 */
export function preserveProtoMessageSource<Desc extends DescMessage>(
  desc: Desc,
  target: MessageShape<Desc>,
  source?: MessageShape<Desc>
): MessageShape<Desc> {
  if (!source) {
    return target;
  }
  const message = clone(desc, target);
  preserveMessageUnknownFields(desc, message, source);
  return message;
}

/**
 * Builds an edited message from form values while retaining unknown wire
 * fields from the parsed source message. Unknown fields are not part of the
 * form model, so reconstructing a message from values alone would drop them.
 */
export function formValuesToProto<Desc extends DescMessage>(
  desc: Desc,
  values: Record<string, unknown>,
  source?: MessageShape<Desc>,
  options: ProtoConversionOptions = {}
): MessageShape<Desc> {
  const message = create(desc, formValuesToProtoInit(desc, values, options));
  if (source) {
    preserveMessageUnknownFields(desc, message, source);
  }
  return message;
}

export function protoFormValuesToPayload<Desc extends DescMessage>(
  desc: Desc,
  values: Record<string, unknown>,
  options: ProtoConversionOptions = {}
): unknown {
  try {
    const init = formValuesToProtoInit(desc, values, options);
    const message = create(desc, init);
    // `alwaysEmitImplicit: true` forces every scalar / message field to
    // appear in the serialized JSON even when the form hasn't been
    // touched. Without it, an untouched form renders as `{}` in the
    // summary panel — so users have to start typing just to see the
    // request shape. Emitting defaults gives them the full schema
    // skeleton up front and reduces the interactions needed to
    // visualise what will actually be sent.
    return toJson(desc, message, { alwaysEmitImplicit: true }) as unknown;
  } catch {
    try {
      return formValuesToProtoInit(desc, values, options);
    } catch {
      return values;
    }
  }
}

export function protoPayloadToFormValues<Desc extends DescMessage>(
  desc: Desc,
  payload: unknown
): FormValues | undefined {
  try {
    const message = fromJson(desc, (payload ?? {}) as JsonValue);
    return protoToFormValues(desc, message);
  } catch {
    return;
  }
}

function normalizeIssuePath(
  desc: DescMessage,
  issue: SchemaIssue,
  values: Record<string, unknown>
): (string | number)[] {
  if (!issue.path || issue.path.length === 0) {
    return [];
  }

  const normalizedPath: (string | number)[] = [];
  let currentDesc: DescMessage | undefined = desc;

  for (let index = 0; index < issue.path.length; index += 1) {
    const segment: StandardSchemaV1.PathSegment | PropertyKey | undefined = issue.path[index];
    const key = typeof segment === "object" && segment && "key" in segment ? segment.key : segment;

    if (typeof key === "number") {
      normalizedPath.push(key);
      continue;
    }

    if (!currentDesc || typeof key !== "string") {
      normalizedPath.push(String(key));
      continue;
    }

    const matchedField: DescField | undefined = currentDesc.field[key];
    const oneof = currentDesc.oneofs.find((candidate) => candidate.localName === key);

    if (oneof) {
      normalizedPath.push(oneof.localName);
      currentDesc = undefined;
      continue;
    }

    if (!matchedField) {
      normalizedPath.push(key);
      currentDesc = undefined;
      continue;
    }

    normalizedPath.push(matchedField.localName);

    if (matchedField.fieldKind === "map") {
      const nextSegment = issue.path[index + 1];
      const mapKey =
        typeof nextSegment === "object" && nextSegment && "key" in nextSegment ? nextSegment.key : nextSegment;
      const mapEntries = Array.isArray(values[matchedField.localName])
        ? (values[matchedField.localName] as ProtoMapFormEntry[])
        : [];
      const mapIndex = typeof mapKey === "string" ? mapEntries.findIndex((entry) => entry.key === mapKey) : -1;

      if (mapIndex !== -1 && issue.path.length > index + 2 && matchedField.mapKind === "message") {
        normalizedPath.push(mapIndex, "value");
        currentDesc = matchedField.message;
        index += 1;
        continue;
      }

      // If the protovalidate key no longer matches a rendered map entry, keep the error on the
      // map field itself instead of targeting a stale array index in RHF state.
      return normalizedPath;
    }

    if (matchedField.fieldKind === "message") {
      if (isWrapperDesc(matchedField.message) || PROTO_JSON_FALLBACK_TYPES.includes(matchedField.message.typeName)) {
        return normalizedPath;
      }
      currentDesc = matchedField.message;
      continue;
    }

    if (matchedField.fieldKind === "list" && matchedField.listKind === "message") {
      if (isWrapperDesc(matchedField.message) || PROTO_JSON_FALLBACK_TYPES.includes(matchedField.message.typeName)) {
        return normalizedPath;
      }
      // Guard against stale array indices: if the next segment is a numeric index,
      // verify the array still has that many entries. If not, anchor the error on
      // the list field itself (same fallback strategy as map fields).
      const nextSegment = issue.path[index + 1];
      const nextKey =
        typeof nextSegment === "object" && nextSegment && "key" in nextSegment ? nextSegment.key : nextSegment;
      if (typeof nextKey === "number") {
        const listEntries = values[matchedField.localName];
        if (!Array.isArray(listEntries) || nextKey >= listEntries.length) {
          return normalizedPath;
        }
      }
      currentDesc = matchedField.message;
      continue;
    }

    currentDesc = undefined;
  }

  return normalizedPath;
}

/** A Standard Schema issue whose path is already normalized to form paths. */
export interface NormalizedProtoIssue {
  message: string;
  path: (string | number)[];
}

export type NormalizedProtoValidationResult<Output> =
  | StandardSchemaV1.SuccessResult<Output>
  | { readonly issues: readonly NormalizedProtoIssue[] };

export interface ProtoValidationContext {
  /**
   * Restrict pathful issues to fields overlapping this mask. Message-level
   * issues remain visible because they cannot be attributed safely.
   */
  validationMask?: FieldMask | undefined;
}

const SIGNED_32_SCALARS = [ScalarType.INT32, ScalarType.SINT32, ScalarType.SFIXED32];
const UNSIGNED_32_SCALARS = [ScalarType.UINT32, ScalarType.FIXED32];
const SIGNED_64_SCALARS = [ScalarType.INT64, ScalarType.SINT64, ScalarType.SFIXED64];
const UNSIGNED_64_SCALARS = [ScalarType.UINT64, ScalarType.FIXED64];
const SIGNED_32_MIN = -2_147_483_648;
const SIGNED_32_MAX = 2_147_483_647;
const UNSIGNED_32_MAX = 4_294_967_295;
const SIGNED_64_MIN = -9_223_372_036_854_775_808n;
const SIGNED_64_MAX = 9_223_372_036_854_775_807n;
const UNSIGNED_64_MAX = 18_446_744_073_709_551_615n;

function getScalarConversionIssue(field: ScalarField, value: unknown): string | undefined {
  if (value === undefined || value === null || value === "") {
    return;
  }
  if (SIGNED_32_SCALARS.includes(field.scalar)) {
    const numericValue = normalizeNumberValue(value);
    if (
      numericValue === undefined ||
      !Number.isInteger(numericValue) ||
      numericValue < SIGNED_32_MIN ||
      numericValue > SIGNED_32_MAX
    ) {
      return "Enter a signed 32-bit integer.";
    }
  }
  if (UNSIGNED_32_SCALARS.includes(field.scalar)) {
    const numericValue = normalizeNumberValue(value);
    if (
      numericValue === undefined ||
      !Number.isInteger(numericValue) ||
      numericValue < 0 ||
      numericValue > UNSIGNED_32_MAX
    ) {
      return "Enter an unsigned 32-bit integer.";
    }
  }
  if (SIGNED_64_SCALARS.includes(field.scalar)) {
    const bigintValue = normalizeBigIntValue(value);
    if (bigintValue === undefined || bigintValue < SIGNED_64_MIN || bigintValue > SIGNED_64_MAX) {
      return "Enter a signed 64-bit integer.";
    }
  }
  if (UNSIGNED_64_SCALARS.includes(field.scalar)) {
    const bigintValue = normalizeBigIntValue(value);
    if (bigintValue === undefined || bigintValue < 0n || bigintValue > UNSIGNED_64_MAX) {
      return "Enter an unsigned 64-bit integer.";
    }
  }
  return;
}

function getMessageConversionIssue(field: MessageField, value: unknown): string | undefined {
  if (value === undefined || value === null || value === "") {
    return;
  }
  if (field.message.typeName === TIMESTAMP_TYPE) {
    return typeof value === "string" && !Number.isNaN(new Date(value).getTime())
      ? undefined
      : "Enter a valid date and time.";
  }
  if (field.message.typeName === DURATION_TYPE) {
    if (typeof value !== "string") {
      return "Enter a valid duration.";
    }
    try {
      fromJsonString(DurationSchema, JSON.stringify(value));
      return;
    } catch {
      return "Enter a valid duration.";
    }
  }
  if (field.message.typeName !== ANY_TYPE || !isPlainObject(value)) {
    return;
  }
  const { valueBase64 } = value as ProtoAnyFormValue;
  if (valueBase64 === undefined || valueBase64 === "") {
    return;
  }
  try {
    base64Decode(valueBase64);
    return;
  } catch {
    return "Enter valid base64 data.";
  }
}

function getMapConversionIssue(value: unknown): string | undefined {
  if (!Array.isArray(value)) {
    return;
  }
  const keys = value.flatMap((entry) => {
    if (!isPlainObject(entry)) {
      return [];
    }
    const key = entry["key"];
    return key === undefined || key === null || key === "" ? [] : [String(key)];
  });
  return new Set(keys).size === keys.length ? undefined : "Map keys must be unique.";
}

function getFormConversionIssues(desc: DescMessage, values: Record<string, unknown>): NormalizedProtoIssue[] {
  return desc.members.flatMap((member) => {
    if (member.kind === "oneof") {
      return [];
    }
    let message: string | undefined;
    if (member.fieldKind === "scalar") {
      message = getScalarConversionIssue(member, values[member.localName]);
    } else if (member.fieldKind === "message") {
      message = getMessageConversionIssue(member, values[member.localName]);
    } else if (member.fieldKind === "map") {
      message = getMapConversionIssue(values[member.localName]);
    }
    return message ? [{ message, path: [member.localName] }] : [];
  });
}

function toFailureResult(error: unknown): {
  readonly issues: readonly NormalizedProtoIssue[];
} {
  return {
    issues: [
      {
        message: error instanceof Error ? error.message : "Failed to validate protobuf form values.",
        path: [],
      },
    ],
  };
}

function normalizeValidationResult<Desc extends DescMessage>(
  desc: Desc,
  values: Record<string, unknown>,
  validationResult: StandardSchemaV1.Result<MessageValidType<Desc>>,
  fallbackValue: MessageShape<Desc>,
  context: ProtoValidationContext
): NormalizedProtoValidationResult<MessageValidType<Desc>> {
  if (validationResult.issues) {
    const issues = filterValidationIssues(
      desc,
      validationResult.issues.map((issue) => ({
        message: issue.message,
        path: normalizeIssuePath(desc, issue, values),
      })),
      context.validationMask
    );
    if (issues.length === 0) {
      return { value: fallbackValue as MessageValidType<Desc> };
    }
    return {
      issues,
    };
  }

  return validationResult;
}

function filterValidationIssues(
  desc: DescMessage,
  issues: readonly NormalizedProtoIssue[],
  validationMask?: FieldMask
): readonly NormalizedProtoIssue[] {
  if (!validationMask || validationMask.paths.includes("*")) {
    return issues;
  }

  const formPaths = validationMask.paths.flatMap((path) => {
    const formPath = protoPathToFormPath(desc, path);
    return formPath ? [formPath] : [];
  });

  return issues.filter((issue) => {
    if (issue.path.length === 0) {
      return true;
    }
    const issuePath = issue.path.join(".");
    return formPaths.some(
      (formPath) =>
        issuePath === formPath || issuePath.startsWith(`${formPath}.`) || formPath.startsWith(`${issuePath}.`)
    );
  });
}

/**
 * Shared validation pipeline: form values → proto init → `create()` →
 * protovalidate Standard Schema → issues re-pathed to FORM paths
 * (camelCase keys, oneofs flattened, map keys resolved to entry indices).
 *
 * Both `createProtoFormSchema` and `ProtoProvider.validateSchema` (and the
 * registry's react-hook-form resolver) flow through this single function.
 */
export function validateFormValuesAgainstProtoSchema<Desc extends DescMessage>(
  desc: Desc,
  values: Record<string, unknown>,
  schema: StandardSchemaV1<MessageShape<Desc>, MessageValidType<Desc>>,
  options: ProtoConversionOptions = {},
  source?: MessageShape<Desc>,
  context: ProtoValidationContext = {}
):
  | NormalizedProtoValidationResult<MessageValidType<Desc>>
  | Promise<NormalizedProtoValidationResult<MessageValidType<Desc>>> {
  try {
    const conversionIssues = filterValidationIssues(
      desc,
      getFormConversionIssues(desc, values),
      context.validationMask
    );
    if (conversionIssues.length > 0) {
      return { issues: conversionIssues };
    }
    const message = formValuesToProto(desc, values, source, options);
    const validationResult = schema["~standard"].validate(message);

    if (validationResult instanceof Promise) {
      return validationResult
        .then((result) => normalizeValidationResult(desc, values, result, message, context))
        .catch((error: unknown) => toFailureResult(error));
    }

    return normalizeValidationResult(desc, values, validationResult, message, context);
  } catch (error) {
    return toFailureResult(error);
  }
}
