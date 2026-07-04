import { describe, expect, it } from "vitest";
import { setupSearchSchema } from "@/routes/setup-search";

describe("setup route search", () => {
  it("accepts in-app return targets", () => {
    expect(setupSearchSchema.parse({ returnTo: "/instances/prod" })).toEqual({
      returnTo: "/instances/prod",
    });
  });

  it("rejects external or recursive return targets", () => {
    expect(() =>
      setupSearchSchema.parse({ returnTo: "https://example.com" })
    ).toThrow();
    expect(() =>
      setupSearchSchema.parse({ returnTo: "//evil.test" })
    ).toThrow();
    expect(() => setupSearchSchema.parse({ returnTo: "/setup" })).toThrow();
  });
});
