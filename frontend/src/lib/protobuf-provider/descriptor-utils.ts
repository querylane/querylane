import { type DescField, ScalarType } from "@bufbuild/protobuf";
import { FeatureSet_FieldPresence } from "@bufbuild/protobuf/wkt";

const GOOGLE_PROTOBUF_PREFIX = "google.protobuf.";

export const TIMESTAMP_TYPE = `${GOOGLE_PROTOBUF_PREFIX}Timestamp`;
export const DURATION_TYPE = `${GOOGLE_PROTOBUF_PREFIX}Duration`;
export const FIELD_MASK_TYPE = `${GOOGLE_PROTOBUF_PREFIX}FieldMask`;
export const STRUCT_TYPE = `${GOOGLE_PROTOBUF_PREFIX}Struct`;
export const VALUE_TYPE = `${GOOGLE_PROTOBUF_PREFIX}Value`;
export const LIST_VALUE_TYPE = `${GOOGLE_PROTOBUF_PREFIX}ListValue`;
export const ANY_TYPE = `${GOOGLE_PROTOBUF_PREFIX}Any`;

export type ScalarField = Extract<DescField, { fieldKind: "scalar" }>;
export type EnumField = Extract<DescField, { fieldKind: "enum" }>;
export type MessageField = Extract<DescField, { fieldKind: "message" }>;
export type ListField = Extract<DescField, { fieldKind: "list" }>;
export type MapField = Extract<DescField, { fieldKind: "map" }>;

export function tracksPresence(field: DescField): boolean {
  return field.presence !== FeatureSet_FieldPresence.IMPLICIT;
}

export function is64BitScalar(scalar: ScalarType | undefined): boolean {
  return (
    scalar === ScalarType.INT64 ||
    scalar === ScalarType.UINT64 ||
    scalar === ScalarType.SINT64 ||
    scalar === ScalarType.FIXED64 ||
    scalar === ScalarType.SFIXED64
  );
}

export function cloneField(field: DescField, overrides: Partial<DescField>): DescField {
  return {
    ...field,
    ...overrides,
  } as DescField;
}
