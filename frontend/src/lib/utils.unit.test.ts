import { describe, expect, it } from "@rstest/core";
import { cn as cnfast } from "cnfast";
import { cn } from "./utils";

describe("cn", () => {
  it("keeps the last conflicting Tailwind class", () => {
    expect(cn("px-2", "px-4")).toBe("px-4");
  });

  it("uses cnfast for the shadcn class helper", () => {
    expect(cn).toBe(cnfast);
  });
});
