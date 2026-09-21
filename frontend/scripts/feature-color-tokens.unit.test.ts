import { readFileSync } from "node:fs";
import { describe, expect, test } from "@rstest/core";

const RAW_COLOR = /#[\da-f]{3,8}\b|rgba?\(/i;

// Color primitives belong in scoped token palettes, not consuming effects.
describe("feature effects consume design tokens", () => {
  test.each([
    "branding/querylane-logo.module.css",
    "onboarding-wizard/phases/progress-phase.module.css",
    "onboarding-wizard/wizard-content.module.css",
  ])("%s contains no raw color literals", (file) => {
    const css = readFileSync(
      new URL(`../src/components/${file}`, import.meta.url),
      "utf8"
    );
    expect(css).not.toMatch(RAW_COLOR);
  });
});
