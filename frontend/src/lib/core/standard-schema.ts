import type { StandardSchemaV1 } from "@standard-schema/spec";

export type { StandardSchemaV1 } from "@standard-schema/spec";

export function isStandardSchema(value: unknown): value is StandardSchemaV1 {
  if ((typeof value !== "object" && typeof value !== "function") || value === null) {
    return false;
  }
  const marker = (value as { "~standard"?: unknown })["~standard"];
  if (typeof marker !== "object" || marker === null) {
    return false;
  }
  const props = marker as Partial<StandardSchemaV1.Props>;
  return props.version === 1 && typeof props.vendor === "string" && typeof props.validate === "function";
}
