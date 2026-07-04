import { describe, expect, test } from "vitest";
import vitestConfig from "../vitest.config";
import {
  VITEST_PROJECT_CONFIGS,
  VITEST_PROJECT_NAME_ORDER,
} from "../vitest.projects";

describe("Vitest projects", () => {
  test("groups unit, integration, browser light, and browser dark configs in one project run", () => {
    expect(vitestConfig.test?.projects).toEqual([...VITEST_PROJECT_CONFIGS]);
  });

  test("gives each project a stable reporter label", () => {
    expect([...VITEST_PROJECT_NAME_ORDER]).toEqual([
      "unit",
      "integration",
      "browser-light",
      "browser-dark",
    ]);
  });
});
