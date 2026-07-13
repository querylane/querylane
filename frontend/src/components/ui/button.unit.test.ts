import { describe, expect, it } from "vitest";
import { buttonVariants } from "@/components/ui/button";

describe("buttonVariants", () => {
  it("owns the foreign key reference affordance", () => {
    const classes = buttonVariants({ variant: "reference" });

    expect(classes).toContain("text-reference");
    expect(classes).toContain("decoration-dotted");
    expect(classes).toContain(
      "hover:[color:color-mix(in_oklch,var(--reference)_82%,var(--foreground))]"
    );
  });
});
