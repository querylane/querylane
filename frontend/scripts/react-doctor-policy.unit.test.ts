import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, test } from "vitest";

const projectRoot = resolve(import.meta.dirname, "..");

type JsonRecord = Record<string, unknown>;

function isJsonRecord(value: unknown): value is JsonRecord {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function readJsonRecord(path: string) {
  const parsed: unknown = JSON.parse(
    readFileSync(resolve(projectRoot, path), "utf8")
  );

  if (!isJsonRecord(parsed)) {
    throw new Error(`${path} must be a JSON object.`);
  }

  return parsed;
}

function getRecordProperty(record: JsonRecord, key: string) {
  const value = record[key];
  if (!isJsonRecord(value)) {
    return {};
  }

  return value;
}

describe("React Doctor policy", () => {
  test("does not disable React Doctor rules", () => {
    const doctorConfig = readJsonRecord("doctor.config.json");
    const ignore = getRecordProperty(doctorConfig, "ignore");
    const rules = getRecordProperty(doctorConfig, "rules");

    expect(ignore["rules"] ?? []).toEqual([]);
    expect(Object.values(rules)).not.toContain("off");
  });
});
