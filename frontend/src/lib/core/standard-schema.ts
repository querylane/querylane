import type { StandardSchemaV1 } from "@standard-schema/spec";
import { isRecord } from "@/lib/value-guards";

export type { StandardSchemaV1 } from "@standard-schema/spec";

export function isStandardSchema(value: unknown): value is StandardSchemaV1 {
  if (
    (typeof value !== "object" && typeof value !== "function") ||
    value === null
  ) {
    return false;
  }
  if (!("~standard" in value)) {
    return false;
  }
  const marker = value["~standard"];
  return (
    isRecord(marker) &&
    marker["version"] === 1 &&
    typeof marker["vendor"] === "string" &&
    typeof marker["validate"] === "function"
  );
}
