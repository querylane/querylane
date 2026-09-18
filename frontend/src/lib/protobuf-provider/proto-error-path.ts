import type { DescField, DescMessage, DescOneof } from "@bufbuild/protobuf";

/**
 * Convert a server-side proto field path into the camelCase form path used by
 * Protoform adapters. Oneof branches flatten under `{oneofLocalName}.value`.
 */
export function protoPathToFormPath(schema: DescMessage, serverPath: string): string | null {
  if (!serverPath) {
    return null;
  }
  const path = walk(schema, serverPath.split("."));
  return path ? path.join(".") : null;
}

function walk(current: DescMessage, segments: readonly string[]): string[] | null {
  if (segments.length === 0) {
    return [];
  }
  const [head, ...rest] = segments;
  if (!head) {
    return null;
  }
  const resolved = findMember(current, head);
  if (!resolved) {
    return null;
  }

  if (resolved.kind === "oneof") {
    if (rest.length === 0) {
      return [resolved.oneof.localName];
    }
    const [branchName, ...afterBranch] = rest;
    if (!branchName) {
      return null;
    }
    const branch = resolved.oneof.fields.find((candidate) => candidate.name === branchName);
    if (!branch) {
      return null;
    }
    const tail = walkInto(branch, afterBranch);
    return tail === null ? null : [resolved.oneof.localName, "value", ...tail];
  }

  const { field } = resolved;
  const formPath = field.oneof ? [field.oneof.localName, "value"] : [field.localName];
  if (rest.length === 0) {
    return formPath;
  }
  if (!field.message) {
    return null;
  }
  const tail = walk(field.message, rest);
  return tail === null ? null : [...formPath, ...tail];
}

function walkInto(field: DescField, segments: readonly string[]): string[] | null {
  if (segments.length === 0) {
    return [];
  }
  return field.message ? walk(field.message, segments) : null;
}

type Resolved = { kind: "field"; field: DescField } | { kind: "oneof"; oneof: DescOneof };

function findMember(message: DescMessage, protoName: string): Resolved | undefined {
  for (const member of message.members) {
    if (member.kind === "oneof") {
      if (member.name === protoName) {
        return { kind: "oneof", oneof: member };
      }
      const field = member.fields.find((candidate) => candidate.name === protoName);
      if (field) {
        return { field, kind: "field" };
      }
    } else if (member.name === protoName) {
      return { field: member, kind: "field" };
    }
  }
  return;
}
