import {
  clone,
  create,
  type DescField,
  type DescMessage,
  type DescOneof,
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
  TimestampSchema,
  timestampDate,
  timestampFromDate,
  ValueSchema,
} from "@bufbuild/protobuf/wkt";
import type { ValidatorOptions } from "@bufbuild/protovalidate";
import type {
  EmptyRepeatedStringPolicy,
  FormValues,
} from "@/lib/core/field-model";
import type { StandardSchemaV1 } from "@/lib/core/standard-schema";
import { isNonEmptyString, isUnknownArray } from "@/lib/value-guards";
import type { ProtoformMessageFormatter } from "../core/messages.js";
import {
  ANY_TYPE,
  DURATION_TYPE,
  FIELD_MASK_TYPE,
  is64BitScalar,
  LIST_VALUE_TYPE,
  type ListField,
  type MapField,
  type MessageField,
  STRUCT_TYPE,
  TIMESTAMP_TYPE,
  tracksPresence,
  VALUE_TYPE,
} from "./descriptor-utils.js";
import type { ProtoFormShape } from "./form-values.js";
import { protoPathToFormPath } from "./proto-error-path.js";

const NANOSECOND_DIGITS = 9;
const NANOSECONDS_PER_MILLISECOND = 1_000_000;
const MILLISECOND_DIGITS = 3;

const TRAILING_FRACTION_ZEROES = /0+$/u;
const TIMESTAMP_FRACTION = /\.(?<capture1>\d{1,9})/u;

const PROTO_JSON_FALLBACK_TYPES = new Set([
  TIMESTAMP_TYPE,
  DURATION_TYPE,
  FIELD_MASK_TYPE,
  STRUCT_TYPE,
  VALUE_TYPE,
  LIST_VALUE_TYPE,
  ANY_TYPE,
]);

const PROTO_FORM_ROOT_ERROR_KEY = "__protoFormRoot__";

type SchemaIssue = StandardSchemaV1.Issue;
type AnyObject = Record<string, unknown>;

interface ProtoAnyFormValue {
  typeUrl?: string;
  valueBase64?: string;
}

interface ProtoMapFormEntry {
  key: unknown;
  value: unknown;
}

interface ProtoConversionOptions {
  emptyRepeatedStringPolicies?:
    | Readonly<Record<string, EmptyRepeatedStringPolicy>>
    | undefined;
}

interface ProtoFormOptions extends ValidatorOptions, ProtoConversionOptions {
  formatMessage?: ProtoformMessageFormatter | undefined;
}

function isEmptyFormValue(value: unknown): value is undefined | null | "" {
  return value === undefined || value === null || value === "";
}

function isPlainObject(value: unknown): value is Record<string, unknown> {
  return value !== null && typeof value === "object" && !isUnknownArray(value);
}

function toDateTimeLocalValue(
  timestamp: MessageShape<typeof TimestampSchema> | undefined
): string | undefined {
  if (!timestamp) {
    return;
  }

  const date = timestampDate({
    ...timestamp,
    nanos:
      Math.floor(timestamp.nanos / NANOSECONDS_PER_MILLISECOND) *
      NANOSECONDS_PER_MILLISECOND,
  });
  if (Number.isNaN(date.getTime())) {
    return;
  }

  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, "0");
  const day = String(date.getDate()).padStart(2, "0");
  const hours = String(date.getHours()).padStart(2, "0");
  const minutes = String(date.getMinutes()).padStart(2, "0");

  const seconds = String(date.getSeconds()).padStart(2, "0");
  const fraction = date.getMilliseconds()
    ? `.${String(date.getMilliseconds()).padStart(MILLISECOND_DIGITS, "0").replace(TRAILING_FRACTION_ZEROES, "")}`
    : "";
  return `${year}-${month}-${day}T${hours}:${minutes}${date.getSeconds() || fraction ? `:${seconds}${fraction}` : ""}`;
}

function objectHasValues(value: Record<string, unknown>): boolean {
  return Object.values(value).some(hasFormValue);
}

function hasFormValue(entry: unknown): boolean {
  if (entry === undefined || entry === null) {
    return false;
  }
  if (typeof entry === "string") {
    return entry.trim().length > 0;
  }
  if (isUnknownArray(entry)) {
    return entry.length > 0;
  }
  return isPlainObject(entry) ? objectHasValues(entry) : true;
}

function isJsonValue(value: unknown): value is JsonValue {
  if (
    value === null ||
    typeof value === "string" ||
    typeof value === "boolean"
  ) {
    return true;
  }
  if (typeof value === "number") {
    return Number.isFinite(value);
  }
  if (isUnknownArray(value)) {
    return value.every(isJsonValue);
  }
  return isPlainObject(value) && Object.values(value).every(isJsonValue);
}

function scalarToFormValue(
  scalar: ScalarType | undefined,
  value: unknown
): unknown {
  if (scalar === ScalarType.BYTES) {
    return value instanceof Uint8Array ? base64Encode(value) : undefined;
  }
  if (is64BitScalar(scalar)) {
    return typeof value === "bigint" ? value.toString() : (value ?? undefined);
  }
  return value;
}

function anyToFormValue(value: unknown): ProtoAnyFormValue | undefined {
  if (!isPlainObject(value)) {
    return;
  }
  return {
    typeUrl: typeof value["typeUrl"] === "string" ? value["typeUrl"] : "",
    valueBase64:
      value["value"] instanceof Uint8Array ? base64Encode(value["value"]) : "",
  };
}

function jsonMessageToFormValue(field: MessageField, value: unknown): unknown {
  if (isMessage(value, field.message)) {
    return toJson(field.message, value);
  }
  if (!isJsonValue(value)) {
    return undefined;
  }
  switch (field.message.typeName) {
    case STRUCT_TYPE:
      return isPlainObject(value) ? structuredClone(value) : undefined;
    case VALUE_TYPE:
      return structuredClone(value);
    case LIST_VALUE_TYPE:
      return isUnknownArray(value) ? structuredClone(value) : undefined;
    default:
      return undefined;
  }
}

function fieldMaskToFormValue(value: unknown): unknown {
  if (!isPlainObject(value)) {
    return undefined;
  }
  const { paths } = value;
  return isUnknownArray(paths) &&
    paths.every((path) => typeof path === "string")
    ? paths
    : undefined;
}

function messageFieldToFormValue(field: MessageField, value: unknown): unknown {
  if (isWrapperDesc(field.message)) {
    return scalarToFormValue(
      field.message.fields[0]?.scalar,
      value ?? undefined
    );
  }
  switch (field.message.typeName) {
    case TIMESTAMP_TYPE:
      return toDateTimeLocalValue(
        isMessage(value, TimestampSchema) ? value : undefined
      );
    case DURATION_TYPE:
      return isMessage(value, DurationSchema)
        ? toJsonString(DurationSchema, value).replaceAll('"', "")
        : undefined;
    case FIELD_MASK_TYPE:
      return fieldMaskToFormValue(value);
    case STRUCT_TYPE:
    case VALUE_TYPE:
    case LIST_VALUE_TYPE:
      return jsonMessageToFormValue(field, value);
    case ANY_TYPE:
      return anyToFormValue(value);
    default:
      return isPlainObject(value)
        ? messageToFormValues(field.message, value)
        : undefined;
  }
}

function fieldToFormValue(field: DescField, value: unknown): unknown {
  switch (field.fieldKind) {
    case "scalar":
      return scalarToFormValue(field.scalar, value);
    case "enum":
      return value;
    case "message":
      return messageFieldToFormValue(field, value);
    case "list":
      return isUnknownArray(value)
        ? value.map((item) => listItemToFormValue(field, item))
        : [];
    case "map":
      return isPlainObject(value)
        ? Object.entries(value).map(
            ([key, entryValue]) =>
              ({
                key: mapKeyToFormValue(field, key),
                value: mapValueToFormValue(field, entryValue),
              }) satisfies ProtoMapFormEntry
          )
        : [];
    default:
      return field satisfies never;
  }
}

function listItemToFormValue(field: ListField, value: unknown): unknown {
  if (value === null) {
    return null;
  }
  const hasValue = Boolean(value);
  if (field.listKind === "message" && hasValue) {
    if (isWrapperDesc(field.message)) {
      return value;
    }
    return messageToFormValues(field.message, value);
  }

  return field.listKind === "scalar"
    ? scalarToFormValue(field.scalar, value)
    : value;
}

function mapValueToFormValue(field: MapField, value: unknown): unknown {
  if (value === null) {
    return null;
  }
  const hasValue = Boolean(value);
  if (field.mapKind === "message" && hasValue) {
    if (isWrapperDesc(field.message)) {
      return value;
    }
    return messageToFormValues(field.message, value);
  }

  return field.mapKind === "scalar"
    ? scalarToFormValue(field.scalar, value)
    : value;
}

function mapKeyToFormValue(
  field: MapField,
  key: string
): string | number | boolean {
  if (field.mapKey === ScalarType.BOOL) {
    return key === "true";
  }
  if (is64BitScalar(field.mapKey) || field.mapKey === ScalarType.STRING) {
    return key;
  }
  return Number(key);
}

function oneofToFormValue(member: DescOneof, value: unknown): unknown {
  if (!(isPlainObject(value) && isNonEmptyString(value["case"]))) {
    return { case: undefined, value: undefined };
  }
  const activeField = member.fields.find(
    (field) => field.localName === value["case"]
  );
  return {
    case: value["case"],
    value: activeField
      ? fieldToFormValue(activeField, value["value"])
      : value["value"],
  };
}

function messageToFormValues(
  desc: DescMessage,
  value: unknown
): Record<string, unknown> {
  if (!isPlainObject(value)) {
    return {};
  }
  const result: Record<string, unknown> = {};

  for (const member of desc.members) {
    if (member.kind === "oneof") {
      result[member.localName] = oneofToFormValue(
        member,
        value[member.localName]
      );
      continue;
    }

    result[member.localName] = fieldToFormValue(
      member,
      value[member.localName]
    );
  }

  return result;
}

function protoToFormValues<Desc extends DescMessage>(
  desc: Desc,
  value?: MessageShape<Desc>
): ProtoFormShape<Desc>;
function protoToFormValues(
  desc: DescMessage,
  value?: MessageShape<DescMessage>
) {
  return messageToFormValues(desc, value ?? create(desc));
}

function normalizeBooleanValue(value: unknown): boolean | undefined {
  if (isEmptyFormValue(value)) {
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
  if (isEmptyFormValue(value)) {
    return;
  }
  if (typeof value === "number") {
    return Number.isNaN(value) ? undefined : value;
  }
  const parsed = Number(value);
  return Number.isNaN(parsed) ? undefined : parsed;
}

function normalizeFloatingPointValue(value: unknown): number | undefined {
  if (isEmptyFormValue(value)) {
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
  if (isEmptyFormValue(value)) {
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
      return undefined;
    }
  }
  return undefined;
}

function mapKeyText(value: unknown): string {
  if (
    typeof value === "string" ||
    typeof value === "number" ||
    typeof value === "bigint" ||
    typeof value === "boolean"
  ) {
    return String(value);
  }
  throw new TypeError("Expected a scalar map key");
}

function scalarString(value: unknown): string {
  if (
    typeof value === "string" ||
    typeof value === "number" ||
    typeof value === "bigint" ||
    typeof value === "boolean"
  ) {
    return String(value);
  }
  throw new TypeError("Expected a scalar string form value");
}

function normalizeBytesValue(value: unknown) {
  if (typeof value === "string") {
    return base64Decode(value);
  }
  return value instanceof Uint8Array ? value : undefined;
}

function normalizeScalarValue(
  scalar: ScalarType | undefined,
  value: unknown
): unknown {
  if (scalar === ScalarType.STRING) {
    return value === undefined || value === null
      ? undefined
      : scalarString(value);
  }
  if (scalar === ScalarType.BOOL) {
    return normalizeBooleanValue(value);
  }
  if (scalar === ScalarType.BYTES) {
    return normalizeBytesValue(value);
  }
  if (scalar === ScalarType.FLOAT || scalar === ScalarType.DOUBLE) {
    return normalizeFloatingPointValue(value);
  }
  if (is64BitScalar(scalar)) {
    return normalizeBigIntValue(value);
  }
  return normalizeNumberValue(value);
}

function timestampFromFormValue(value: unknown) {
  if (!isNonEmptyString(value)) {
    return;
  }
  const timestamp = timestampFromDate(new Date(value));
  const fraction = TIMESTAMP_FRACTION.exec(value)?.[1];
  if (isNonEmptyString(fraction)) {
    timestamp.nanos = Number(fraction.padEnd(NANOSECOND_DIGITS, "0"));
  }
  return timestamp;
}

function optionalStringFormValue(value: unknown): string {
  if (value === undefined) {
    return "";
  }
  if (typeof value !== "string") {
    throw new TypeError("Expected a string form value");
  }
  return value;
}

function anyFromFormValue(value: unknown) {
  if (!isPlainObject(value)) {
    return;
  }
  const typeUrl = optionalStringFormValue(value["typeUrl"]);
  const valueBase64 = optionalStringFormValue(value["valueBase64"]);
  if (!(isNonEmptyString(typeUrl) || isNonEmptyString(valueBase64))) {
    return;
  }
  return { typeUrl, value: base64Decode(valueBase64) };
}

function jsonMessageFromFormValue(
  field: MessageField,
  value: unknown
): unknown {
  if (value === undefined) {
    return;
  }
  const json = field.message.typeName === STRUCT_TYPE ? (value ?? {}) : value;
  if (!isJsonValue(json)) {
    throw new TypeError("Expected a JSON form value");
  }
  switch (field.message.typeName) {
    case STRUCT_TYPE:
      return fromJson(StructSchema, json);
    case VALUE_TYPE:
      return fromJson(ValueSchema, json);
    case LIST_VALUE_TYPE:
      return fromJson(ListValueSchema, json);
    default:
      throw new TypeError("Expected a JSON protobuf descriptor");
  }
}

function normalizeMessageFieldValue({
  field,
  value,
  options,
  path,
}: {
  field: MessageField;
  value: unknown;
  options: ProtoConversionOptions;
  path: readonly string[];
}): unknown {
  if (isWrapperDesc(field.message)) {
    return normalizeScalarValue(field.message.fields[0]?.scalar, value);
  }
  switch (field.message.typeName) {
    case TIMESTAMP_TYPE:
      return timestampFromFormValue(value);
    case DURATION_TYPE:
      return isNonEmptyString(value)
        ? fromJsonString(DurationSchema, JSON.stringify(value))
        : undefined;
    case FIELD_MASK_TYPE:
      return isUnknownArray(value) && value.length > 0
        ? {
            paths: value.filter(
              (entry): entry is string => typeof entry === "string"
            ),
          }
        : undefined;
    case STRUCT_TYPE:
    case VALUE_TYPE:
    case LIST_VALUE_TYPE:
      return jsonMessageFromFormValue(field, value);
    case ANY_TYPE:
      return anyFromFormValue(value);
    default:
      return nestedMessageFromFormValue({ field, value, options, path });
  }
}

function nestedMessageFromFormValue({
  field,
  value,
  options,
  path,
}: {
  field: MessageField;
  value: unknown;
  options: ProtoConversionOptions;
  path: readonly string[];
}) {
  const nested = isPlainObject(value)
    ? messageToProtoInit({ desc: field.message, value, options, path })
    : undefined;
  if (nested && objectHasValues(nested)) {
    return nested;
  }
  return tracksPresence(field) ? undefined : nested;
}

function listItemToProtoValue({
  field,
  value,
  options,
  path,
}: {
  field: ListField;
  value: unknown;
  options: ProtoConversionOptions;
  path: readonly string[];
}): unknown {
  if (field.listKind === "scalar") {
    return normalizeScalarValue(field.scalar, value);
  }
  if (field.listKind === "enum") {
    return value === undefined || value === "" ? undefined : Number(value);
  }
  if (isWrapperDesc(field.message)) {
    return value;
  }
  return isPlainObject(value)
    ? messageToProtoInit({ desc: field.message, value, options, path })
    : undefined;
}

function mapValueToProtoValue({
  field,
  value,
  options,
  path,
}: {
  field: MapField;
  value: unknown;
  options: ProtoConversionOptions;
  path: readonly string[];
}): unknown {
  if (field.mapKind === "scalar") {
    return normalizeScalarValue(field.scalar, value);
  }
  if (field.mapKind === "enum") {
    return value === undefined || value === "" ? undefined : Number(value);
  }
  if (isWrapperDesc(field.message)) {
    return value;
  }
  return isPlainObject(value)
    ? messageToProtoInit({ desc: field.message, value, options, path })
    : undefined;
}

function repeatedListEntries({
  field,
  value,
  options,
  path,
}: {
  field: ListField;
  value: unknown;
  options: ProtoConversionOptions;
  path: readonly string[];
}): unknown[] {
  if (!isUnknownArray(value)) {
    return [];
  }
  const policy = options.emptyRepeatedStringPolicies?.[path.join(".")];
  if (
    field.listKind !== "scalar" ||
    field.scalar !== ScalarType.STRING ||
    policy === "preserve"
  ) {
    return value;
  }
  return value.filter(
    (entry) => typeof entry !== "string" || entry.trim().length > 0
  );
}

function fieldToProtoValue({
  field,
  value,
  options,
  path,
}: {
  field: DescField;
  value: unknown;
  options: ProtoConversionOptions;
  path: readonly string[];
}): unknown {
  switch (field.fieldKind) {
    case "scalar":
      return normalizeScalarValue(field.scalar, value);
    case "enum":
      return value === undefined || value === "" ? undefined : Number(value);
    case "message":
      return normalizeMessageFieldValue({ field, value, options, path });
    case "list":
      return repeatedListEntries({ field, value, options, path }).map((entry) =>
        listItemToProtoValue({ field, value: entry, options, path })
      );
    case "map": {
      const entries = isPlainObject(value)
        ? Object.entries(value).map(([key, mapValue]) => ({
            key,
            value: mapValue,
          }))
        : value;
      return isUnknownArray(entries)
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
                return [
                  mapKeyText(mapKey),
                  mapValueToProtoValue({
                    field,
                    value: entry["value"],
                    options,
                    path,
                  }),
                ] as const;
              })
              .filter(
                (entry): entry is readonly [string, unknown] => entry !== null
              )
          )
        : {};
    }
    default:
      return value;
  }
}

function oneofToProtoInit({
  member,
  value,
  options,
  path,
}: {
  member: DescOneof;
  value: unknown;
  options: ProtoConversionOptions;
  path: readonly string[];
}): { case: string; value: unknown } | undefined {
  if (!(isPlainObject(value) && isNonEmptyString(value["case"]))) {
    return undefined;
  }
  const field = member.fields.find(
    (candidate) => candidate.localName === value["case"]
  );
  if (!field) {
    return undefined;
  }
  return {
    case: value["case"],
    value: fieldToProtoValue({
      field,
      value: value["value"],
      options,
      path: [...path, member.localName, field.localName],
    }),
  };
}

function messageToProtoInit({
  desc,
  value,
  options,
  path,
}: {
  desc: DescMessage;
  value: AnyObject;
  options: ProtoConversionOptions;
  path: readonly string[];
}): Record<string, unknown> {
  const result: Record<string, unknown> = {};

  for (const member of desc.members) {
    if (member.kind === "oneof") {
      const normalized = oneofToProtoInit({
        member,
        value: value[member.localName],
        options,
        path,
      });
      if (normalized) {
        result[member.localName] = normalized;
      }
      continue;
    }

    const normalized = fieldToProtoValue({
      field: member,
      value: value[member.localName],
      options,
      path: [...path, member.localName],
    });
    if (normalized === undefined && tracksPresence(member)) {
      continue;
    }
    result[member.localName] = normalized;
  }

  return result;
}

function formValuesToProtoInit<Desc extends DescMessage>(
  desc: Desc,
  values: Record<string, unknown>,
  options?: ProtoConversionOptions
): MessageInitShape<Desc>;
function formValuesToProtoInit(
  desc: DescMessage,
  values: Record<string, unknown>,
  options: ProtoConversionOptions = {}
) {
  return messageToProtoInit({ desc, value: values, options, path: [] });
}

function knownMessageValuesEqual({
  desc,
  left,
  right,
  preserveTimestampPrecision,
}: {
  desc: DescMessage;
  left: AnyObject;
  right: AnyObject;
  preserveTimestampPrecision: boolean;
}): boolean {
  if (!(isMessage(left, desc) && isMessage(right, desc))) {
    return false;
  }
  if (toJsonString(desc, left) === toJsonString(desc, right)) {
    return true;
  }
  if (!(preserveTimestampPrecision && isMessage(left, desc))) {
    return false;
  }
  const comparable = clone(desc, left);
  preserveMessageUnknownFields({
    desc,
    target: comparable,
    source: right,
    preserveTimestampPrecision: true,
  });
  return toJsonString(desc, comparable) === toJsonString(desc, right);
}

interface RepeatedMatchContext {
  desc: DescMessage;
  matchedSourceIndexes: ReadonlySet<number>;
  matchedTargetIndexes: ReadonlySet<number>;
  preserveTimestampPrecision: boolean;
  source: unknown[];
  target: unknown[];
  targetValue: AnyObject;
}

function uniqueRepeatedSourceIndex({
  desc,
  targetValue,
  source,
  target,
  matchedSourceIndexes,
  matchedTargetIndexes,
  preserveTimestampPrecision,
}: RepeatedMatchContext): number | undefined {
  const candidates = source.flatMap((value, candidateIndex) =>
    !matchedSourceIndexes.has(candidateIndex) &&
    isPlainObject(value) &&
    knownMessageValuesEqual({
      desc,
      left: targetValue,
      right: value,
      preserveTimestampPrecision,
    })
      ? [candidateIndex]
      : []
  );
  if (candidates.length !== 1) {
    return undefined;
  }
  const [index] = candidates;
  const sourceValue = index === undefined ? undefined : source[index];
  if (!isPlainObject(sourceValue)) {
    return undefined;
  }
  const competitors = target.filter(
    (candidate, targetIndex) =>
      !matchedTargetIndexes.has(targetIndex) &&
      isPlainObject(candidate) &&
      knownMessageValuesEqual({
        desc,
        left: candidate,
        right: sourceValue,
        preserveTimestampPrecision,
      })
  );
  return competitors.length === 1 ? index : undefined;
}

function preserveRepeatedMessageUnknownFields({
  desc,
  target,
  source,
  preserveTimestampPrecision,
}: {
  desc: DescMessage;
  target: unknown[];
  source: unknown[];
  preserveTimestampPrecision: boolean;
}): void {
  const matchedSourceIndexes = new Set<number>();
  const matchedTargetIndexes = new Set<number>();

  for (const [targetIndex, targetValue] of target.entries()) {
    if (!isPlainObject(targetValue)) {
      continue;
    }
    const sourceIndex = uniqueRepeatedSourceIndex({
      desc,
      targetValue,
      source,
      target,
      matchedSourceIndexes,
      matchedTargetIndexes,
      preserveTimestampPrecision,
    });
    if (sourceIndex === undefined) {
      continue;
    }
    const sourceValue = source[sourceIndex];
    if (!isPlainObject(sourceValue)) {
      continue;
    }
    preserveMessageUnknownFields({
      desc,
      target: targetValue,
      source: sourceValue,
      preserveTimestampPrecision,
    });
    matchedSourceIndexes.add(sourceIndex);
    matchedTargetIndexes.add(targetIndex);
  }

  preservePositionalUnknownFields({
    desc,
    target,
    source,
    matchedSourceIndexes,
    matchedTargetIndexes,
    preserveTimestampPrecision,
  });
}

function preservePositionalUnknownFields({
  desc,
  target,
  source,
  matchedSourceIndexes,
  matchedTargetIndexes,
  preserveTimestampPrecision,
}: Omit<RepeatedMatchContext, "targetValue">): void {
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
    preserveMessageUnknownFields({
      desc,
      target: targetValue,
      source: sourceValue,
      preserveTimestampPrecision,
    });
  }
}

function preserveMapUnknownFields({
  desc,
  target,
  source,
  preserveTimestampPrecision,
}: {
  desc: DescMessage;
  target: AnyObject;
  source: AnyObject;
  preserveTimestampPrecision: boolean;
}) {
  for (const [key, targetValue] of Object.entries(target)) {
    const sourceValue = source[key];
    if (isPlainObject(targetValue) && isPlainObject(sourceValue)) {
      preserveMessageUnknownFields({
        desc,
        target: targetValue,
        source: sourceValue,
        preserveTimestampPrecision,
      });
    }
  }
}

function preserveFieldUnknownFields({
  field,
  target,
  source,
  preserveTimestampPrecision,
}: {
  field: DescField;
  target: unknown;
  source: unknown;
  preserveTimestampPrecision: boolean;
}): void {
  switch (field.fieldKind) {
    case "message":
      if (isPlainObject(target) && isPlainObject(source)) {
        preserveMessageUnknownFields({
          desc: field.message,
          target,
          source,
          preserveTimestampPrecision,
        });
      }
      return;
    case "list":
      if (
        field.listKind === "message" &&
        isUnknownArray(target) &&
        isUnknownArray(source)
      ) {
        preserveRepeatedMessageUnknownFields({
          desc: field.message,
          target,
          source,
          preserveTimestampPrecision,
        });
      }
      return;
    case "map":
      if (
        field.mapKind === "message" &&
        isPlainObject(target) &&
        isPlainObject(source)
      ) {
        preserveMapUnknownFields({
          desc: field.message,
          target,
          source,
          preserveTimestampPrecision,
        });
      }
      break;
    case "enum":
    case "scalar":
      break;
    default:
      throw new TypeError(
        `Unsupported field: ${String(field satisfies never)}`
      );
  }
}

function preserveTimestampSourcePrecision(
  target: AnyObject,
  source: AnyObject
) {
  if (
    isMessage(target, TimestampSchema) &&
    isMessage(source, TimestampSchema) &&
    target.nanos % NANOSECONDS_PER_MILLISECOND === 0
  ) {
    const sourceValue = toDateTimeLocalValue(source);
    if (
      sourceValue !== undefined &&
      sourceValue !== "" &&
      sourceValue === toDateTimeLocalValue(target)
    ) {
      target.seconds = source.seconds;
      target.nanos = source.nanos;
    }
  }
}

function preserveOneofUnknownFields({
  member,
  target,
  source,
  preserveTimestampPrecision,
}: {
  member: DescOneof;
  target: unknown;
  source: unknown;
  preserveTimestampPrecision: boolean;
}) {
  if (!(isPlainObject(target) && isPlainObject(source))) {
    return;
  }
  const targetCase = target["case"];
  if (typeof targetCase !== "string" || targetCase !== source["case"]) {
    return;
  }
  const field = member.fields.find(
    (candidate) => candidate.localName === targetCase
  );
  if (field) {
    preserveFieldUnknownFields({
      field,
      target: target["value"],
      source: source["value"],
      preserveTimestampPrecision,
    });
  }
}

function preserveMessageUnknownFields({
  desc,
  target,
  source,
  preserveTimestampPrecision = false,
}: {
  desc: DescMessage;
  target: AnyObject;
  source: AnyObject;
  preserveTimestampPrecision?: boolean;
}): void {
  if (preserveTimestampPrecision) {
    preserveTimestampSourcePrecision(target, source);
  }
  const hasUnknownFields = Boolean(source["$unknown"]);
  if (hasUnknownFields) {
    target["$unknown"] = structuredClone(source["$unknown"]);
  }

  for (const member of desc.members) {
    if (member.kind === "oneof") {
      preserveOneofUnknownFields({
        member,
        target: target[member.localName],
        source: source[member.localName],
        preserveTimestampPrecision,
      });
      continue;
    }

    preserveFieldUnknownFields({
      field: member,
      target: target[member.localName],
      source: source[member.localName],
      preserveTimestampPrecision,
    });
  }
}

function preserveProtoMessageSource<Desc extends DescMessage>(
  desc: Desc,
  target: MessageShape<Desc>,
  source?: MessageShape<Desc>
): MessageShape<Desc> {
  if (!source) {
    return target;
  }
  const message = clone(desc, target);
  preserveMessageUnknownFields({ desc, target: message, source });
  return message;
}

function formValuesToProto<Desc extends DescMessage>({
  desc,
  values,
  source,
  options = {},
}: {
  desc: Desc;
  values: Record<string, unknown>;
  source?: MessageShape<Desc> | undefined;
  options?: ProtoConversionOptions;
}): MessageShape<Desc> {
  const message = create(desc, formValuesToProtoInit(desc, values, options));
  if (source) {
    preserveMessageUnknownFields({
      desc,
      target: message,
      source,
      preserveTimestampPrecision: true,
    });
  }
  return message;
}

function protoFormValuesToPayload(
  desc: DescMessage,
  values: Record<string, unknown>,
  options: ProtoConversionOptions = {}
): unknown {
  try {
    const init = formValuesToProtoInit(desc, values, options);
    const message = create(desc, init);
    return toJson(desc, message, { alwaysEmitImplicit: true });
  } catch {
    try {
      return formValuesToProtoInit(desc, values, options);
    } catch {
      return values;
    }
  }
}

function protoPayloadToFormValues(
  desc: DescMessage,
  payload: unknown
): FormValues | undefined {
  try {
    const json = payload ?? {};
    if (!isJsonValue(json)) {
      throw new TypeError("Expected a JSON protobuf payload");
    }
    const message = fromJson(desc, json);
    return protoToFormValues(desc, message);
  } catch {
    return undefined;
  }
}

type IssuePath = NonNullable<SchemaIssue["path"]>;

interface IssuePathCursor {
  desc: DescMessage | undefined;
  index: number;
  normalized: (string | number)[];
  stop: boolean;
}

function issuePathKey(
  segment: StandardSchemaV1.PathSegment | PropertyKey | undefined
): PropertyKey | undefined {
  return segment !== null && typeof segment === "object" && "key" in segment
    ? segment.key
    : segment;
}

function normalizeMapIssuePath({
  field,
  path,
  values,
  cursor,
}: {
  field: MapField;
  path: IssuePath;
  values: AnyObject;
  cursor: IssuePathCursor;
}) {
  const key = issuePathKey(path[cursor.index + 1]);
  const entries = values[field.localName];
  const mapEntries = isUnknownArray(entries) ? entries : [];
  const mapIndex =
    typeof key === "string"
      ? mapEntries.findIndex(
          (entry) => isPlainObject(entry) && entry["key"] === key
        )
      : -1;
  if (
    mapIndex !== -1 &&
    path.length > cursor.index + 2 &&
    field.mapKind === "message"
  ) {
    cursor.normalized.push(mapIndex, "value");
    cursor.desc = field.message;
    cursor.index += 1;
    return;
  }
  if (
    !isUnknownArray(entries) &&
    (typeof key === "string" || typeof key === "number")
  ) {
    cursor.normalized.push(key);
    cursor.index += 1;
    cursor.desc = field.message;
    return;
  }
  cursor.stop = true;
}

function normalizeMessageIssuePath({
  field,
  path,
  values,
  cursor,
}: {
  field: MessageField | (ListField & { listKind: "message" });
  path: IssuePath;
  values: AnyObject;
  cursor: IssuePathCursor;
}) {
  if (
    isWrapperDesc(field.message) ||
    PROTO_JSON_FALLBACK_TYPES.has(field.message.typeName)
  ) {
    cursor.stop = true;
    return;
  }
  if (field.fieldKind === "list") {
    const key = issuePathKey(path[cursor.index + 1]);
    const entries = values[field.localName];
    if (
      typeof key === "number" &&
      (!isUnknownArray(entries) || key >= entries.length)
    ) {
      cursor.stop = true;
      return;
    }
  }
  cursor.desc = field.message;
}

function advanceIssuePath({
  path,
  values,
  cursor,
}: {
  path: IssuePath;
  values: AnyObject;
  cursor: IssuePathCursor;
}) {
  const key = issuePathKey(path[cursor.index]);
  if (typeof key === "number") {
    cursor.normalized.push(key);
    return;
  }
  if (!cursor.desc || typeof key !== "string") {
    cursor.normalized.push(String(key));
    return;
  }
  const field = cursor.desc.field[key];
  const oneof = cursor.desc.oneofs.find(
    (candidate) => candidate.localName === key
  );
  cursor.normalized.push(oneof?.localName ?? field?.localName ?? key);
  if (oneof || !field) {
    cursor.desc = undefined;
    return;
  }
  advanceFieldIssuePath({ field, path, values, cursor });
}

function advanceFieldIssuePath({
  field,
  path,
  values,
  cursor,
}: {
  field: DescField;
  path: IssuePath;
  values: AnyObject;
  cursor: IssuePathCursor;
}) {
  if (field.fieldKind === "map") {
    normalizeMapIssuePath({ field, path, values, cursor });
    return;
  }
  if (
    field.fieldKind === "message" ||
    (field.fieldKind === "list" && field.listKind === "message")
  ) {
    normalizeMessageIssuePath({ field, path, values, cursor });
    return;
  }
  cursor.desc = undefined;
}

function normalizeIssuePath(
  desc: DescMessage,
  issue: SchemaIssue,
  values: AnyObject
): (string | number)[] {
  const cursor: IssuePathCursor = {
    desc,
    normalized: [],
    index: 0,
    stop: false,
  };
  const path = issue.path ?? [];
  for (; cursor.index < path.length && !cursor.stop; cursor.index += 1) {
    advanceIssuePath({ path, values, cursor });
  }
  return cursor.normalized;
}

interface NormalizedProtoIssue {
  message: string;
  path: (string | number)[];
}

type NormalizedProtoValidationResult<Output> =
  | StandardSchemaV1.SuccessResult<Output>
  | { readonly issues: readonly NormalizedProtoIssue[] };

interface ProtoValidationContext {
  validationMask?: FieldMask | undefined;
}

const SIGNED_32_SCALARS = new Set([
  ScalarType.INT32,
  ScalarType.SINT32,
  ScalarType.SFIXED32,
]);
const UNSIGNED_32_SCALARS = new Set([ScalarType.UINT32, ScalarType.FIXED32]);
const SIGNED_64_SCALARS = new Set([
  ScalarType.INT64,
  ScalarType.SINT64,
  ScalarType.SFIXED64,
]);
const UNSIGNED_64_SCALARS = new Set([ScalarType.UINT64, ScalarType.FIXED64]);
const SIGNED_32_MIN = -2_147_483_648;
const SIGNED_32_MAX = 2_147_483_647;
const UNSIGNED_32_MAX = 4_294_967_295;
const SIGNED_64_MIN = -9_223_372_036_854_775_808n;
const SIGNED_64_MAX = 9_223_372_036_854_775_807n;
const UNSIGNED_64_MAX = 18_446_744_073_709_551_615n;

function integerConversionIssue(
  value: unknown,
  min: number,
  max: number
): boolean {
  const numeric = normalizeNumberValue(value);
  return (
    numeric === undefined ||
    !Number.isInteger(numeric) ||
    numeric < min ||
    numeric > max
  );
}

function bigintConversionIssue(
  value: unknown,
  min: bigint,
  max: bigint
): boolean {
  const numeric = normalizeBigIntValue(value);
  return numeric === undefined || numeric < min || numeric > max;
}

function getScalarConversionIssue(
  scalar: ScalarType | undefined,
  value: unknown
): string | undefined {
  if (isEmptyFormValue(value)) {
    return undefined;
  }
  if (scalar === undefined) {
    throw new TypeError("Missing protobuf scalar type");
  }
  if (
    SIGNED_32_SCALARS.has(scalar) &&
    integerConversionIssue(value, SIGNED_32_MIN, SIGNED_32_MAX)
  ) {
    return "Enter a signed 32-bit integer.";
  }
  if (
    UNSIGNED_32_SCALARS.has(scalar) &&
    integerConversionIssue(value, 0, UNSIGNED_32_MAX)
  ) {
    return "Enter an unsigned 32-bit integer.";
  }
  if (
    SIGNED_64_SCALARS.has(scalar) &&
    bigintConversionIssue(value, SIGNED_64_MIN, SIGNED_64_MAX)
  ) {
    return "Enter a signed 64-bit integer.";
  }
  if (
    UNSIGNED_64_SCALARS.has(scalar) &&
    bigintConversionIssue(value, 0n, UNSIGNED_64_MAX)
  ) {
    return "Enter an unsigned 64-bit integer.";
  }
  return undefined;
}

function durationConversionIssue(value: unknown): string | undefined {
  if (typeof value !== "string") {
    return "Enter a valid duration.";
  }
  try {
    fromJsonString(DurationSchema, JSON.stringify(value));
    return undefined;
  } catch {
    return "Enter a valid duration.";
  }
}

function getMessageConversionIssue(
  desc: DescMessage,
  value: unknown
): string | undefined {
  if (isEmptyFormValue(value)) {
    return;
  }
  if (desc.typeName === TIMESTAMP_TYPE) {
    return typeof value === "string" && !Number.isNaN(new Date(value).getTime())
      ? undefined
      : "Enter a valid date and time.";
  }
  if (desc.typeName === DURATION_TYPE) {
    return durationConversionIssue(value);
  }

  if (desc.typeName !== ANY_TYPE || !isPlainObject(value)) {
    return;
  }
  return anyConversionIssue(value);
}

function anyConversionIssue(value: AnyObject): string | undefined {
  const { valueBase64 } = value;
  if (valueBase64 === undefined || valueBase64 === "") {
    return;
  }
  if (typeof valueBase64 !== "string") {
    return "Enter valid base64 data.";
  }
  try {
    base64Decode(valueBase64);
  } catch {
    return "Enter valid base64 data.";
  }
  return undefined;
}

function getMapConversionIssue(value: unknown): string | undefined {
  if (!isUnknownArray(value)) {
    return;
  }
  const keys = value.flatMap((entry) => {
    if (!isPlainObject(entry)) {
      return [];
    }
    const { key } = entry;
    return key === undefined || key === null || key === ""
      ? []
      : [mapKeyText(key)];
  });
  return new Set(keys).size === keys.length
    ? undefined
    : "Map keys must be unique.";
}

function conversionIssue(
  message: string | undefined,
  path: (string | number)[]
): NormalizedProtoIssue[] {
  return isNonEmptyString(message) ? [{ message, path }] : [];
}
function getMessageValueConversionIssues(
  desc: DescMessage,
  value: unknown,
  path: (string | number)[]
): NormalizedProtoIssue[] {
  if (isWrapperDesc(desc)) {
    return conversionIssue(
      getScalarConversionIssue(desc.fields[0]?.scalar, value),
      path
    );
  }
  const message = getMessageConversionIssue(desc, value);
  if (!PROTO_JSON_FALLBACK_TYPES.has(desc.typeName) && isPlainObject(value)) {
    return getFormConversionIssues(desc, value, path);
  }
  return conversionIssue(message, path);
}
function getElementConversionIssues(
  field: ListField | MapField,
  value: unknown,
  path: (string | number)[]
): NormalizedProtoIssue[] {
  if (field.scalar !== undefined) {
    return conversionIssue(getScalarConversionIssue(field.scalar, value), path);
  }
  return field.message
    ? getMessageValueConversionIssues(field.message, value, path)
    : [];
}
function getMapValueConversionIssues(
  field: MapField,
  value: unknown,
  path: (string | number)[]
): NormalizedProtoIssue[] {
  const issues = conversionIssue(getMapConversionIssue(value), path);
  if (isUnknownArray(value)) {
    return [
      ...issues,
      ...value.flatMap((entry, index) =>
        isPlainObject(entry)
          ? getElementConversionIssues(field, entry["value"], [
              ...path,
              index,
              "value",
            ])
          : []
      ),
    ];
  }
  return isPlainObject(value)
    ? [
        ...issues,
        ...Object.entries(value).flatMap(([key, entry]) =>
          getElementConversionIssues(field, entry, [...path, key])
        ),
      ]
    : issues;
}
function getFieldConversionIssues(
  field: DescField,
  value: unknown,
  path: (string | number)[]
): NormalizedProtoIssue[] {
  switch (field.fieldKind) {
    case "scalar":
      return conversionIssue(
        getScalarConversionIssue(field.scalar, value),
        path
      );
    case "enum":
      return [];
    case "message":
      return getMessageValueConversionIssues(field.message, value, path);
    case "list":
      return isUnknownArray(value)
        ? value.flatMap((entry, index) =>
            getElementConversionIssues(field, entry, [...path, index])
          )
        : [];
    case "map":
      return getMapValueConversionIssues(field, value, path);
    default:
      return field satisfies never;
  }
}

function getFormConversionIssues(
  desc: DescMessage,
  values: Record<string, unknown>,
  path: (string | number)[] = []
): NormalizedProtoIssue[] {
  return desc.members.flatMap((member) => {
    if (member.kind === "oneof") {
      const selection = values[member.localName];
      if (!isPlainObject(selection)) {
        return [];
      }
      const selected = member.fields.find(
        (field) => field.localName === selection["case"]
      );
      return selected
        ? getFieldConversionIssues(selected, selection["value"], [
            ...path,
            member.localName,
            "value",
          ])
        : [];
    }
    return getFieldConversionIssues(member, values[member.localName], [
      ...path,
      member.localName,
    ]);
  });
}

function toFailureResult(error: unknown): {
  readonly issues: readonly NormalizedProtoIssue[];
} {
  return {
    issues: [
      {
        message:
          error instanceof Error
            ? error.message
            : "Failed to validate protobuf form values.",
        path: [],
      },
    ],
  };
}

function normalizeValidationResult<Desc extends DescMessage>({
  desc,
  values,
  validationResult,
  fallbackValue,
  context,
}: {
  desc: Desc;
  values: Record<string, unknown>;
  validationResult: StandardSchemaV1.Result<MessageValidType<Desc>>;
  fallbackValue: MessageShape<Desc>;
  context: ProtoValidationContext;
}): NormalizedProtoValidationResult<MessageShape<Desc>> {
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
      return { value: fallbackValue };
    }
    return {
      issues,
    };
  }

  if (!isMessage(validationResult.value, desc)) {
    return toFailureResult(
      new TypeError("Validation returned a different protobuf message type")
    );
  }
  return { value: validationResult.value };
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
    return formPath !== null && formPath !== "" ? [formPath] : [];
  });

  return issues.filter((issue) => {
    if (issue.path.length === 0) {
      return true;
    }
    const issuePath = issue.path.join(".");
    return formPaths.some(
      (formPath) =>
        issuePath === formPath ||
        issuePath.startsWith(`${formPath}.`) ||
        formPath.startsWith(`${issuePath}.`)
    );
  });
}

function validateFormValuesAgainstProtoSchema<Desc extends DescMessage>({
  desc,
  values,
  schema,
  options = {},
  source,
  context = {},
}: {
  desc: Desc;
  values: Record<string, unknown>;
  schema: StandardSchemaV1<MessageShape<Desc>, MessageValidType<Desc>>;
  options?: ProtoConversionOptions;
  source?: MessageShape<Desc> | undefined;
  context?: ProtoValidationContext;
}):
  | NormalizedProtoValidationResult<MessageShape<Desc>>
  | Promise<NormalizedProtoValidationResult<MessageShape<Desc>>> {
  try {
    const conversionIssues = filterValidationIssues(
      desc,
      getFormConversionIssues(desc, values),
      context.validationMask
    );
    if (conversionIssues.length > 0) {
      return { issues: conversionIssues };
    }
    const message = formValuesToProto({ desc, values, source, options });
    const validationResult = schema["~standard"].validate(message);

    if (validationResult instanceof Promise) {
      return validationResult
        .then((result) =>
          normalizeValidationResult({
            desc,
            values,
            validationResult: result,
            fallbackValue: message,
            context,
          })
        )
        .catch((error: unknown) => toFailureResult(error));
    }

    return normalizeValidationResult({
      desc,
      values,
      validationResult,
      fallbackValue: message,
      context,
    });
  } catch (error) {
    return toFailureResult(error);
  }
}

export {
  formValuesToProto,
  formValuesToProtoInit,
  type NormalizedProtoIssue,
  type NormalizedProtoValidationResult,
  PROTO_FORM_ROOT_ERROR_KEY,
  type ProtoAnyFormValue,
  type ProtoConversionOptions,
  type ProtoFormOptions,
  type ProtoMapFormEntry,
  type ProtoValidationContext,
  preserveProtoMessageSource,
  protoFormValuesToPayload,
  protoPayloadToFormValues,
  protoToFormValues,
  validateFormValuesAgainstProtoSchema,
};
