import {
  FieldBehavior,
  field_behavior,
} from "@buf/googleapis_googleapis.bufbuild_es/google/api/field_behavior_pb.js";
import {
  resource,
  resource_reference,
} from "@buf/googleapis_googleapis.bufbuild_es/google/api/resource_pb.js";
import {
  create,
  type DescField,
  type DescMessage,
  getExtension,
} from "@bufbuild/protobuf";
import {
  FieldOptionsSchema,
  MessageOptionsSchema,
} from "@bufbuild/protobuf/wkt";

export interface ProtoResourceMetadata {
  nameField: string;
  patterns: string[];
  plural: string;
  singular: string;
  type: string;
}

export interface ProtoResourceReference {
  childType?: string | undefined;
  type?: string | undefined;
}

export function getProtoResourceMetadata(
  desc: DescMessage
): ProtoResourceMetadata | undefined {
  const metadata = getExtension(
    desc.proto.options ?? create(MessageOptionsSchema),
    resource
  );
  if (!metadata.type && metadata.pattern.length === 0) {
    return;
  }
  return {
    nameField: metadata.nameField || "name",
    patterns: [...metadata.pattern],
    plural: metadata.plural,
    singular: metadata.singular,
    type: metadata.type,
  };
}

export function getProtoResourceReference(
  field: DescField
): ProtoResourceReference | undefined {
  const reference = getExtension(
    field.proto.options ?? create(FieldOptionsSchema),
    resource_reference
  );
  if (!(reference.type || reference.childType)) {
    return;
  }
  return {
    childType: reference.childType || undefined,
    type: reference.type || undefined,
  };
}

export function getProtoFieldBehaviors(
  field: DescField
): readonly FieldBehavior[] {
  return getExtension(
    field.proto.options ?? create(FieldOptionsSchema),
    field_behavior
  ).filter((behavior) => behavior !== FieldBehavior.FIELD_BEHAVIOR_UNSPECIFIED);
}

export function isSingletonProtoResource(desc: DescMessage): boolean {
  const metadata = getProtoResourceMetadata(desc);
  if (!metadata || metadata.patterns.length === 0) {
    return false;
  }
  return metadata.patterns.every((pattern) => {
    const lastSegment = pattern.split("/").at(-1);
    return Boolean(lastSegment && !lastSegment.includes("{"));
  });
}
