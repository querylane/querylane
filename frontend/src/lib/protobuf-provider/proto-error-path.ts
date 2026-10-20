import type { DescField, DescMessage, DescOneof } from "@bufbuild/protobuf";
import { isNonEmptyString } from "@/lib/value-guards";

function protoPathToFormPath(
  schema: DescMessage,
  serverPath: string
): string | null {
  if (!serverPath) {
    return null;
  }
  for (const field of schema.fields) {
    if (field.fieldKind !== "map") {
      continue;
    }
    const mapped = mapFieldPath(field, serverPath);
    if (mapped !== undefined) {
      return mapped;
    }
  }

  const path = walk(
    schema,
    serverPath.replaceAll(LIST_INDEX_PATTERN, ".$1").split(".")
  );
  return path ? path.join(".") : null;
}

function mapFieldPath(
  field: DescField,
  serverPath: string
): string | null | undefined {
  const dotted = `${field.name}.`;
  const bracketed = `${field.name}[`;
  if (serverPath.startsWith(dotted)) {
    const key = serverPath.slice(dotted.length);
    return key ? `${field.localName}.${key}` : null;
  }
  if (serverPath.startsWith(bracketed) && serverPath.endsWith("]")) {
    const encoded = serverPath.slice(bracketed.length, -1);
    try {
      const key: unknown = JSON.parse(encoded);
      return typeof key === "string" && key
        ? `${field.localName}.${key}`
        : null;
    } catch {
      return null;
    }
  }
  return undefined;
}

const LIST_INDEX_PATTERN = /\[(?<capture1>\d+)\]/gu;
const INDEX_SEGMENT_PATTERN = /^\d+$/u;

function walk(
  current: DescMessage,
  segments: readonly string[]
): string[] | null {
  if (segments.length === 0) {
    return [];
  }
  const [head, ...rest] = segments;
  if (!isNonEmptyString(head)) {
    return null;
  }
  const resolved = findMember(current, head);
  if (!resolved) {
    return null;
  }

  if (resolved.kind === "oneof") {
    return walkOneof(resolved.oneof, rest);
  }

  const { field } = resolved;
  const formPath = field.oneof
    ? [field.oneof.localName, "value"]
    : [field.localName];
  if (rest.length === 0) {
    return formPath;
  }
  if (field.fieldKind === "list") {
    return walkListItem(field, formPath, rest);
  }
  if (!field.message) {
    return null;
  }
  const tail = walk(field.message, rest);
  return tail === null ? null : [...formPath, ...tail];
}

function walkOneof(oneof: DescOneof, rest: readonly string[]): string[] | null {
  if (rest.length === 0) {
    return [oneof.localName];
  }
  const [branchName, ...afterBranch] = rest;
  if (!isNonEmptyString(branchName)) {
    return null;
  }
  const branch = oneof.fields.find(
    (candidate) => candidate.name === branchName
  );
  if (!branch) {
    return null;
  }
  const tail = walkInto(branch, afterBranch);
  return tail === null ? null : [oneof.localName, "value", ...tail];
}

function walkListItem(
  field: DescField,
  formPath: string[],
  segments: readonly string[]
): string[] | null {
  const [index, ...afterIndex] = segments;
  if (!(isNonEmptyString(index) && INDEX_SEGMENT_PATTERN.test(index))) {
    return null;
  }
  if (afterIndex.length === 0) {
    return [...formPath, index];
  }
  if (!field.message) {
    return null;
  }
  const tail = walk(field.message, afterIndex);
  return tail === null ? null : [...formPath, index, ...tail];
}

function walkInto(
  field: DescField,
  segments: readonly string[]
): string[] | null {
  if (segments.length === 0) {
    return [];
  }
  return field.message ? walk(field.message, segments) : null;
}

type Resolved =
  | { kind: "field"; field: DescField }
  | { kind: "oneof"; oneof: DescOneof };

function findOneofMember(
  member: DescOneof,
  protoName: string
): Resolved | undefined {
  if (member.name === protoName) {
    return { kind: "oneof", oneof: member };
  }
  const field = member.fields.find((candidate) => candidate.name === protoName);
  return field ? { field, kind: "field" } : undefined;
}

function findMember(
  message: DescMessage,
  protoName: string
): Resolved | undefined {
  for (const member of message.members) {
    if (member.kind === "oneof") {
      const resolved = findOneofMember(member, protoName);
      if (resolved) {
        return resolved;
      }
    } else if (member.name === protoName) {
      return { field: member, kind: "field" };
    }
  }
  return undefined;
}

export { protoPathToFormPath };
