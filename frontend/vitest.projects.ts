export const VITEST_PROJECT_CONFIGS = [
  "./vitest.unit.config.ts",
  "./vitest.integration.config.ts",
  "./vitest.browser.light.config.ts",
  "./vitest.browser.dark.config.ts",
] as const;

export const VITEST_PROJECT_NAMES = {
  browser: "browser",
  browserDark: "browser-dark",
  browserLight: "browser-light",
  integration: "integration",
  unit: "unit",
} as const;

export const VITEST_PROJECT_NAME_ORDER = [
  VITEST_PROJECT_NAMES.unit,
  VITEST_PROJECT_NAMES.integration,
  VITEST_PROJECT_NAMES.browserLight,
  VITEST_PROJECT_NAMES.browserDark,
] as const;
