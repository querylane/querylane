import { describe, expect, test } from "@rstest/core";
import { isNonEmptyString, isRecord, isUnknownArray } from "@/lib/value-guards";

describe("isNonEmptyString", () => {
  test.each(["connection", " ", "0"])(
    "accepts the nonempty string %j",
    (value) => {
      expect(isNonEmptyString(value)).toBe(true);
    }
  );

  test.each([
    { value: undefined },
    { value: null },
    { value: "" },
    { value: false },
    { value: 0 },
    { value: [] },
    { value: {} },
  ])("rejects a missing, empty, or nonstring value $value", ({ value }) => {
    expect(isNonEmptyString(value)).toBe(false);
  });
});

describe("isRecord", () => {
  test("accepts object properties with unknown values", () => {
    expect(isRecord({ name: "connection", nested: null })).toBe(true);
  });
  test.each([
    { value: null },
    { value: undefined },
    { value: "record" },
    { value: 0 },
    { value: [] },
  ])("rejects a nonrecord value $value", ({ value }) => {
    expect(isRecord(value)).toBe(false);
  });
});

describe("isUnknownArray", () => {
  test.each([{ value: [] }, { value: [1, null, {}] }])(
    "accepts an array $value",
    ({ value }) => {
      expect(isUnknownArray(value)).toBe(true);
    }
  );
  test.each([
    { value: null },
    { value: undefined },
    { value: {} },
    { value: "array" },
  ])("rejects a nonarray $value", ({ value }) => {
    expect(isUnknownArray(value)).toBe(false);
  });
});
