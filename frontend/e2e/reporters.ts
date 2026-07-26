import type { PlaywrightTestConfig } from "playwright/test";

const CI_REPORTERS = [
  ["list"],
  ["github"],
  [
    "html",
    {
      mergeFiles: true,
      open: "never",
      outputFolder: "playwright-report",
    },
  ],
  ["json", { outputFile: "test-results/results.json" }],
] satisfies PlaywrightTestConfig["reporter"];

export { CI_REPORTERS };
