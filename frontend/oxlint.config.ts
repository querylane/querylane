import { defineConfig } from "oxlint";
import shadcn from "ultracite/oxlint/shadcn";

// Biome owns general linting and formatting; Oxlint supplies the shadcn rules.
export default defineConfig({
  extends: [shadcn],
  categories: { correctness: "off" },
  plugins: [],
  // Expose the plugin dependency without requiring preset evaluation.
  jsPlugins: [{ name: "shadcn", specifier: "@shadcn/lint" }],
  rules: {
    // Exact external/selector contracts, not Tailwind utility exemptions.
    "shadcn/no-unknown-classes": [
      "error",
      {
        allow: [
          // react-data-grid stylesheet and local data-grid-theme.css.
          "rdg",
          "rdg-light",
          "rdg-cell",
          "rdg-row",
          "rdg-header-row",
          "rdg-expand-button",
          // React Flow interaction hooks.
          "nodrag",
          "nopan",
          // Public code/toast markers retained for downstream selectors.
          "language-sql",
          "language-bash",
          "toaster",
          // Browser-only fixture stylesheet.
          "selected-header-edge-fixture",
        ],
      },
    ],
  },
  settings: {
    shadcn: { ui: ["@/components/ui", "@/components/querylane-ui"] },
  },
  overrides: [
    {
      // Querylane's owned variants compose the unmodified registry components.
      // Consumers still get every rule; authors may define appearance here.
      files: ["src/components/querylane-ui/**"],
      rules: {
        "shadcn/no-restyle": "off",
        "shadcn/require-static-classes": "off",
      },
    },
  ],
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
