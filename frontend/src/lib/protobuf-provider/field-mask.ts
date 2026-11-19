import {
  FieldBehavior,
  field_behavior as fieldBehaviorExtension,
} from "@buf/googleapis_googleapis.bufbuild_es/google/api/field_behavior_pb.js";
import {
  create,
  type DescField,
  type DescMessage,
  type DescOneof,
  getExtension,
} from "@bufbuild/protobuf";
import { FieldMaskSchema, FieldOptionsSchema } from "@bufbuild/protobuf/wkt";

type FormRecord = Record<string, unknown>;

const NON_UPDATABLE_BEHAVIORS = new Set([
  FieldBehavior.IDENTIFIER,
  FieldBehavior.IMMUTABLE,
  FieldBehavior.OUTPUT_ONLY,
]);

function isRecord(value: unknown): value is FormRecord {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

const valuesEqual: (left: unknown, right: unknown) => boolean = (
  left,
  right
) => {
  if (Object.is(left, right)) {
    return true;
  }
  if (left instanceof Date && right instanceof Date) {
    return left.getTime() === right.getTime();
  }
  if (left instanceof Uint8Array && right instanceof Uint8Array) {
    return byteArraysEqual(left, right);
  }
  if (Array.isArray(left) && Array.isArray(right)) {
    return (
      left.length === right.length &&
      left.every((value, index) => valuesEqual(value, right[index]))
    );
  }
  if (!(isRecord(left) && isRecord(right))) {
    return false;
  }

  return recordValuesEqual(left, right);
};

function byteArraysEqual(left: Uint8Array, right: Uint8Array) {
  return (
    left.length === right.length &&
    left.every((value, index) => value === right[index])
  );
}

const recordValuesEqual: (left: FormRecord, right: FormRecord) => boolean = (
  left,
  right
) => {
  const leftKeys = Object.keys(left);
  const rightKeys = Object.keys(right);
  return (
    leftKeys.length === rightKeys.length &&
    leftKeys.every(
      (key) => Object.hasOwn(right, key) && valuesEqual(left[key], right[key])
    )
  );
};

function dirtyFieldsFromValues(current: unknown, initial: unknown) {
  if (valuesEqual(current, initial)) {
    return {} satisfies FormRecord;
  }
  if (!(isRecord(current) && isRecord(initial))) {
    return {} satisfies FormRecord;
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
      isRecord(currentValue) && isRecord(initialValue)
        ? dirtyFieldsFromValues(currentValue, initialValue)
        : true;
  }
  return dirtyFields;
}

const hasDirtyValue: (value: unknown) => boolean = (value) => {
  if (value === true) {
    return true;
  }
  if (Array.isArray(value)) {
    return value.some((item) => hasDirtyValue(item));
  }
  if (isRecord(value)) {
    return Object.values(value).some((item) => hasDirtyValue(item));
  }
  return false;
};

function fieldPath(prefix: string, field: DescField) {
  return prefix ? `${prefix}.${field.name}` : field.name;
}

function isUpdatableField(field: DescField) {
  const behaviors = getExtension(
    field.proto.options ?? create(FieldOptionsSchema),
    fieldBehaviorExtension
  );
  return behaviors.every((behavior) => !NON_UPDATABLE_BEHAVIORS.has(behavior));
}

function findField(schema: DescMessage, segment: string) {
  return schema.fields.find(
    (field) =>
      field.localName === segment ||
      field.name === segment ||
      field.jsonName === segment
  );
}

function normalizeFieldPath(schema: DescMessage, path: string) {
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

    if (
      index === segments.length - 1 ||
      field.fieldKind === "list" ||
      field.fieldKind === "map"
    ) {
      break;
    }
    if (field.fieldKind !== "message") {
      throw new Error(`Field mask path cannot traverse scalar field: ${path}`);
    }
    currentSchema = field.message;
  }
  return normalized.join(".");
}

function fieldOrder(schema: DescMessage, path: string) {
  if (path === "*") {
    return [-1] satisfies number[];
  }

  const order: number[] = [];
  let currentSchema = schema;
  for (const segment of path.split(".")) {
    const index = currentSchema.fields.findIndex(
      (candidate) => candidate.name === segment
    );
    order.push(index);
    const field = currentSchema.fields[index];
    if (field?.fieldKind !== "message") {
      break;
    }
    currentSchema = field.message;
  }
  return order;
}

function compareFieldOrder(schema: DescMessage, left: string, right: string) {
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

function createFieldMask(schema: DescMessage, paths: readonly string[]) {
  const normalizedPaths = [
    ...new Set(paths.map((path) => normalizeFieldPath(schema, path))),
  ];
  if (normalizedPaths.includes("*")) {
    return create(FieldMaskSchema, { paths: ["*"] });
  }
  const minimizedPaths = normalizedPaths.filter((path) =>
    normalizedPaths.every(
      (candidate) => candidate === path || !path.startsWith(`${candidate}.`)
    )
  );
  minimizedPaths.sort((left, right) => compareFieldOrder(schema, left, right));
  return create(FieldMaskSchema, { paths: minimizedPaths });
}

const collectFieldPaths: ({
  field,
  dirtyValue,
  currentValue,
  initialValue,
  prefix,
}: {
  field: DescField;
  dirtyValue: unknown;
  currentValue: unknown;
  initialValue: unknown;
  prefix: string;
}) => string[] = ({
  field,
  dirtyValue,
  currentValue,
  initialValue,
  prefix,
}) => {
  if (!(hasDirtyValue(dirtyValue) && isUpdatableField(field))) {
    return [];
  }

  const path = fieldPath(prefix, field);
  if (
    dirtyValue === true ||
    field.fieldKind === "list" ||
    field.fieldKind === "map"
  ) {
    return [path];
  }
  if (field.fieldKind !== "message" || !isRecord(dirtyValue)) {
    return [path];
  }

  const nestedPaths = collectMessagePaths({
    schema: field.message,
    dirtyFields: dirtyValue,
    currentValues: isRecord(currentValue) ? currentValue : {},
    initialValues: isRecord(initialValue) ? initialValue : {},
    prefix: path,
  });
  return nestedPaths.length > 0 ? nestedPaths : [path];
};

const collectOneofPaths: ({
  oneof,
  dirtyValue,
  currentValue,
  initialValue,
  prefix,
}: {
  oneof: DescOneof;
  dirtyValue: unknown;
  currentValue: unknown;
  initialValue: unknown;
  prefix: string;
}) => string[] = ({
  oneof,
  dirtyValue,
  currentValue,
  initialValue,
  prefix,
}) => {
  if (!hasDirtyValue(dirtyValue)) {
    return [];
  }

  const selectedOneof =
    isRecord(currentValue) && typeof currentValue["case"] === "string"
      ? currentValue
      : initialValue;
  if (!isRecord(selectedOneof)) {
    return [];
  }
  const selectedCase = selectedOneof["case"];
  if (typeof selectedCase !== "string") {
    return [];
  }
  const selectedField = oneof.fields.find(
    (field) => field.localName === selectedCase
  );
  if (!selectedField) {
    return [];
  }

  const nestedDirtyValue =
    isRecord(dirtyValue) &&
    dirtyValue["case"] !== true &&
    hasDirtyValue(dirtyValue["value"])
      ? dirtyValue["value"]
      : true;
  const initialOneofValue = isRecord(initialValue)
    ? initialValue["value"]
    : undefined;
  return collectFieldPaths({
    field: selectedField,
    dirtyValue: nestedDirtyValue,
    currentValue: selectedOneof["value"],
    initialValue: initialOneofValue,
    prefix,
  });
};

const collectMessagePaths: ({
  schema,
  dirtyFields,
  currentValues,
  initialValues,
  prefix,
}: {
  schema: DescMessage;
  dirtyFields: FormRecord;
  currentValues: FormRecord;
  initialValues: FormRecord;
  prefix?: string;
}) => string[] = ({
  schema,
  dirtyFields,
  currentValues,
  initialValues,
  prefix = "",
}) =>
  schema.members.flatMap((member) => {
    if (member.kind === "oneof") {
      return collectOneofPaths({
        oneof: member,
        dirtyValue: dirtyFields[member.localName],
        currentValue: currentValues[member.localName],
        initialValue: initialValues[member.localName],
        prefix,
      });
    }
    return collectFieldPaths({
      field: member,
      dirtyValue: dirtyFields[member.localName],
      currentValue: currentValues[member.localName],
      initialValue: initialValues[member.localName],
      prefix,
    });
  });

function createUpdateMask({
  schema,
  dirtyFields,
  currentValues,
  initialValues,
}: {
  schema: DescMessage;
  dirtyFields: unknown;
  currentValues: unknown;
  initialValues?: unknown;
}) {
  const paths = collectMessagePaths({
    schema,
    dirtyFields: isRecord(dirtyFields) ? dirtyFields : {},
    currentValues: isRecord(currentValues) ? currentValues : {},
    initialValues: isRecord(initialValues) ? initialValues : {},
  });
  return createFieldMask(schema, paths);
}

export { createFieldMask, createUpdateMask, dirtyFieldsFromValues };
