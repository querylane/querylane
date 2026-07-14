import { describe, expect, test, vi } from "vitest";
import { allPredicates, anyPredicate } from "@/lib/predicates";

describe("lazy predicates", () => {
  test("allPredicates stops after the first falsy result", () => {
    const skipped = vi.fn(() => true);

    expect(
      allPredicates(
        () => true,
        () => false,
        skipped
      )
    ).toBe(false);
    expect(skipped).not.toHaveBeenCalled();
  });

  test("anyPredicate stops after the first truthy result", () => {
    const skipped = vi.fn(() => false);

    expect(
      anyPredicate(
        () => false,
        () => true,
        skipped
      )
    ).toBe(true);
    expect(skipped).not.toHaveBeenCalled();
  });
});
