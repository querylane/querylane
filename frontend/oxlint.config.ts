import { defineConfig } from "oxlint";
import shadcn from "ultracite/oxlint/shadcn";

// Biome owns general linting and formatting; Oxlint supplies the shadcn rules.
export default defineConfig({
  extends: [shadcn],
  categories: { correctness: "off" },
  plugins: [],
  // Expose the plugin dependency without requiring preset evaluation.
  jsPlugins: [{ name: "shadcn", specifier: "@shadcn/lint" }],
  ignorePatterns: [
    "node_modules/**",
    "dist/**",
    "build/**",
    "out/**",
    "coverage/**",
    ".nyc_output/**",
    "playwright-report/**",
    "test-results/**",
    "src/protogen/**",
    "**/*.gen.ts",
    "**/*.gen.tsx",
  ],
});
