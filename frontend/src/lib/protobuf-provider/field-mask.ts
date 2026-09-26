import {
  FieldBehavior,
  field_behavior as fieldBehaviorExtension,
} from "@buf/googleapis_googleapis.bufbuild_es/google/api/field_behavior_pb.js";
import { create, type DescField, type DescMessage, type DescOneof, getExtension } from "@bufbuild/protobuf";
import { type FieldMask, FieldMaskSchema, FieldOptionsSchema } from "@bufbuild/protobuf/wkt";

type FormRecord = Record<string, unknown>;

const NON_UPDATABLE_BEHAVIORS = new Set([FieldBehavior.IDENTIFIER, FieldBehavior.IMMUTABLE, FieldBehavior.OUTPUT_ONLY]);

function isRecord(value: unknown): value is FormRecord {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function valuesEqual(left: unknown, right: unknown): boolean {
  if (Object.is(left, right)) {
    return true;
  }
  if (left instanceof Date && right instanceof Date) {
    return left.getTime() === right.getTime();
  }
  if (left instanceof Uint8Array && right instanceof Uint8Array) {
    return (
      left.length === right.length &&
      left.byteLength === right.byteLength &&
      left.every((value, index) => value === right[index])
    );
  }
  if (Array.isArray(left) && Array.isArray(right)) {
    return left.length === right.length && left.every((value, index) => valuesEqual(value, right[index]));
  }
  if (!(isRecord(left) && isRecord(right))) {
    return false;
  }

  const leftKeys = Object.keys(left);
  const rightKeys = Object.keys(right);
  return (
    leftKeys.length === rightKeys.length &&
    leftKeys.every((key) => Object.hasOwn(right, key) && valuesEqual(left[key], right[key]))
  );
}

/** Build the dirty-field tree expected by createUpdateMask from two value snapshots. */
export function dirtyFieldsFromValues(current: unknown, initial: unknown): FormRecord {
  if (valuesEqual(current, initial)) {
    return {};
  }
  if (!(isRecord(current) && isRecord(initial))) {
    return {};
  }

  const dirtyFields: FormRecord = {};
  const keys = new Set([...Object.keys(current), ...Object.keys(initial)]);
  for (const key of keys) {
    const currentValue = current[key];
    const initialValue = initial[key];
    if (valuesEqual(currentValue, initialValue)) {
      continue;
    }
    dirtyFields[key] =
      isRecord(currentValue) && isRecord(initialValue) ? dirtyFieldsFromValues(currentValue, initialValue) : true;
  }
  return dirtyFields;
}

function hasDirtyValue(value: unknown): boolean {
  if (value === true) {
    return true;
  }
  if (Array.isArray(value)) {
    return value.some(hasDirtyValue);
  }
  if (isRecord(value)) {
    return Object.values(value).some(hasDirtyValue);
  }
  return false;
}

function fieldPath(prefix: string, field: DescField): string {
  return prefix ? `${prefix}.${field.name}` : field.name;
}

function isUpdatableField(field: DescField): boolean {
  const behaviors = getExtension(field.proto.options ?? create(FieldOptionsSchema), fieldBehaviorExtension);
  return behaviors.every((behavior) => !NON_UPDATABLE_BEHAVIORS.has(behavior));
}

function findField(schema: DescMessage, segment: string): DescField | undefined {
  return schema.fields.find(
    (field) => field.localName === segment || field.name === segment || field.jsonName === segment
  );
}

function normalizeFieldPath(schema: DescMessage, path: string): string {
  if (path === "*") {
    return path;
  }

  const segments = path.split(".").filter(Boolean);
  if (segments.length === 0) {
    throw new Error("Field mask paths cannot be empty.");
  }

  const normalized: string[] = [];
  let currentSchema = schema;
  for (const [index, segment] of segments.entries()) {
    const field = findField(currentSchema, segment);
    if (!field) {
      throw new Error(`Unknown field mask path: ${path}`);
    }
    normalized.push(field.name);

    if (index === segments.length - 1) {
      break;
    }
    if (field.fieldKind === "list" || field.fieldKind === "map") {
      break;
    }
    if (field.fieldKind !== "message") {
      throw new Error(`Field mask path cannot traverse scalar field: ${path}`);
    }
    currentSchema = field.message;
  }
  return normalized.join(".");
}

function fieldOrder(schema: DescMessage, path: string): number[] {
  if (path === "*") {
    return [-1];
  }

  const order: number[] = [];
  let currentSchema = schema;
  for (const segment of path.split(".")) {
    const index = currentSchema.fields.findIndex((candidate) => candidate.name === segment);
    order.push(index);
    const field = currentSchema.fields[index];
    if (field?.fieldKind !== "message") {
      break;
    }
    currentSchema = field.message;
  }
  return order;
}

function compareFieldOrder(schema: DescMessage, left: string, right: string): number {
  const leftOrder = fieldOrder(schema, left);
  const rightOrder = fieldOrder(schema, right);
  const length = Math.max(leftOrder.length, rightOrder.length);
  for (let index = 0; index < length; index += 1) {
    const difference = (leftOrder[index] ?? -1) - (rightOrder[index] ?? -1);
    if (difference !== 0) {
      return difference;
    }
  }
  return left.localeCompare(right);
}

/** Build a validated, canonical FieldMask from TypeScript or protobuf paths. */
export function createFieldMask(schema: DescMessage, paths: readonly string[]): FieldMask {
  const normalizedPaths = [...new Set(paths.map((path) => normalizeFieldPath(schema, path)))];
  if (normalizedPaths.includes("*")) {
    return create(FieldMaskSchema, { paths: ["*"] });
  }
  const minimizedPaths = normalizedPaths.filter(
    (path) => !normalizedPaths.some((candidate) => candidate !== path && path.startsWith(`${candidate}.`))
  );
  minimizedPaths.sort((left, right) => compareFieldOrder(schema, left, right));
  return create(FieldMaskSchema, { paths: minimizedPaths });
}

function collectFieldPaths(
  field: DescField,
  dirtyValue: unknown,
  currentValue: unknown,
  initialValue: unknown,
  prefix: string
): string[] {
  if (!(hasDirtyValue(dirtyValue) && isUpdatableField(field))) {
    return [];
  }

  const path = fieldPath(prefix, field);
  if (dirtyValue === true || field.fieldKind === "list" || field.fieldKind === "map") {
    return [path];
  }
  if (field.fieldKind !== "message" || !isRecord(dirtyValue)) {
    return [path];
  }

  const nestedPaths = collectMessagePaths(
    field.message,
    dirtyValue,
    isRecord(currentValue) ? currentValue : {},
    isRecord(initialValue) ? initialValue : {},
    path
  );
  return nestedPaths.length > 0 ? nestedPaths : [path];
}

function collectOneofPaths(
  oneof: DescOneof,
  dirtyValue: unknown,
  currentValue: unknown,
  initialValue: unknown,
  prefix: string
): string[] {
  if (!hasDirtyValue(dirtyValue)) {
    return [];
  }

  const selectedOneof =
    isRecord(currentValue) && typeof currentValue["case"] === "string" ? currentValue : initialValue;
  if (!isRecord(selectedOneof)) {
    return [];
  }
  const selectedCase = selectedOneof["case"];
  if (typeof selectedCase !== "string") {
    return [];
  }
  const selectedField = oneof.fields.find((field) => field.localName === selectedCase);
  if (!selectedField) {
    return [];
  }

  const nestedDirtyValue =
    isRecord(dirtyValue) && dirtyValue["case"] !== true && hasDirtyValue(dirtyValue["value"])
      ? dirtyValue["value"]
      : true;
  const initialOneofValue = isRecord(initialValue) ? initialValue["value"] : undefined;
  return collectFieldPaths(selectedField, nestedDirtyValue, selectedOneof["value"], initialOneofValue, prefix);
}

function collectMessagePaths(
  schema: DescMessage,
  dirtyFields: FormRecord,
  currentValues: FormRecord,
  initialValues: FormRecord,
  prefix = ""
): string[] {
  return schema.members.flatMap((member) => {
    if (member.kind === "oneof") {
      return collectOneofPaths(
        member,
        dirtyFields[member.localName],
        currentValues[member.localName],
        initialValues[member.localName],
        prefix
      );
    }
    return collectFieldPaths(
      member,
      dirtyFields[member.localName],
      currentValues[member.localName],
      initialValues[member.localName],
      prefix
    );
  });
}

/** Build an update mask from react-hook-form's dirty field tree. */
export function createUpdateMask(
  schema: DescMessage,
  dirtyFields: unknown,
  currentValues: unknown,
  initialValues?: unknown
): FieldMask {
  const paths = collectMessagePaths(
    schema,
    isRecord(dirtyFields) ? dirtyFields : {},
    isRecord(currentValues) ? currentValues : {},
    isRecord(initialValues) ? initialValues : {}
  );
  return createFieldMask(schema, paths);
}
