import { defineConfig } from "vitest/config";
import { VITEST_PROJECT_CONFIGS } from "./vitest.projects";

export default defineConfig({
  test: {
    projects: [...VITEST_PROJECT_CONFIGS],
  },
});
