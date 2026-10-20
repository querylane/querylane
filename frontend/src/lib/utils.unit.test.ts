import { describe, expect, test } from "@rstest/core";
import { cn } from "@/lib/utils";

describe("cn design-system grammar", () => {
  test("axis spacing overrides the logical sides it covers", () => {
    expect(cn("ps-2 pe-3", "px-4")).toBe("px-4");
    expect(cn("pbs-2 pbe-3", "py-4")).toBe("py-4");
  });

  test("keeps plugin animation classes alongside native animations", () => {
    expect(cn("animate-in", "animate-spin")).toBe("animate-in animate-spin");
  });

  test("preserves variants while resolving the last appearance choice", () => {
    expect(cn("bg-primary hover:bg-muted", false, "bg-secondary")).toBe(
      "hover:bg-muted bg-secondary"
    );
  });
});
