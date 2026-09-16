import { describe, expect, it } from "@rstest/core";
import { cn } from "./utils";

describe("cn", () => {
  it("keeps the last conflicting Tailwind class", () => {
    expect(cn("px-2", "px-4")).toBe("px-4");
  });

  it("flattens conditional inputs before resolving Tailwind conflicts", () => {
    expect(
      cn("flex px-2", [null, false, "px-4"], {
        "gap-2": true,
        hidden: false,
      })
    ).toBe("flex px-4 gap-2");
  });
});
