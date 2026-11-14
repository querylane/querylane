import { defineConfig } from "oxlint";
import core from "ultracite/oxlint/core";
import react from "ultracite/oxlint/react";
import shadcn from "ultracite/oxlint/shadcn";
// Keep an explicit import: Oxlint loads this package from jsPlugins, which
// React Doctor cannot trace through a string specifier.
import "@shadcn/lint";
import "./scripts/querylane-lint.config.ts";

const MAX_BLOCK_DEPTH = 4;

// Biome owns formatting; Oxlint adds native, type-aware, React and design-system checks.
export default defineConfig({
  categories: {
    correctness: "error",
    suspicious: "error",
    perf: "error",
    pedantic: "error",
    style: "error",
    restriction: "error",
    nursery: "error",
  },
  env: { browser: true, node: true },
  options: {
    typeAware: true,
    maxWarnings: 0,
    respectEslintDisableDirectives: false,
    reportUnusedDisableDirectives: "error",
  },
  plugins: [...(core.plugins ?? []), ...(react.plugins ?? []), "jest"],
  // Expose the plugin dependency without requiring preset evaluation.
  jsPlugins: [
    { name: "shadcn", specifier: "@shadcn/lint" },
    { name: "querylane", specifier: "./scripts/querylane-lint.config.ts" },
  ],
  rules: {
    // Copy rules, not preset overrides: tests and declarations get the same checks.
    ...core.rules,
    ...react.rules,
    ...shadcn.rules,
    "querylane/no-manual-memoization": "error",
    "no-restricted-imports": "off",
    "no-restricted-globals": "off",
    "jest/consistent-test-it": "off",
    "jest/expect-expect": "off",
    "jest/max-expects": "off",
    "jest/max-nested-describe": "off",
    "jest/no-alias-methods": "off",
    "jest/no-commented-out-tests": "error",
    "jest/no-conditional-expect": "off",
    "jest/no-conditional-in-test": "off",
    "jest/no-confusing-set-timeout": "off",
    "jest/no-deprecated-functions": "off",
    "jest/no-disabled-tests": "off",
    "jest/no-done-callback": "off",
    "jest/no-duplicate-hooks": "off",
    "jest/no-export": "off",
    "jest/no-focused-tests": "off",
    "jest/no-hooks": "off",
    "jest/no-identical-title": "off",
    "jest/no-interpolation-in-snapshots": "off",
    "jest/no-jasmine-globals": "off",
    "jest/no-large-snapshots": "off",
    "jest/no-mocks-import": "off",
    "jest/no-restricted-jest-methods": "off",
    "jest/no-restricted-matchers": "off",
    "jest/no-standalone-expect": "off",
    "jest/no-test-prefixes": "off",
    "jest/no-test-return-statement": "off",
    "jest/no-unneeded-async-expect-function": "off",
    "jest/no-untyped-mock-factory": "off",
    "jest/padding-around-after-all-blocks": "off",
    "jest/padding-around-test-blocks": "off",
    "jest/prefer-called-with": "off",
    "jest/prefer-comparison-matcher": "off",
    "jest/prefer-each": "off",
    "jest/prefer-ending-with-an-expect": "off",
    "jest/prefer-equality-matcher": "off",
    "jest/prefer-expect-assertions": "off",
    "jest/prefer-expect-resolves": "off",
    "jest/prefer-hooks-in-order": "off",
    "jest/prefer-hooks-on-top": "off",
    "jest/prefer-importing-jest-globals": "off",
    "jest/prefer-jest-mocked": "off",
    "jest/prefer-lowercase-title": "off",
    "jest/prefer-mock-promise-shorthand": "off",
    "jest/prefer-mock-return-shorthand": "off",
    "jest/prefer-snapshot-hint": "off",
    "jest/prefer-spy-on": "off",
    "jest/prefer-strict-equal": "off",
    "jest/prefer-to-be": "off",
    "jest/prefer-to-contain": "off",
    "jest/prefer-to-have-been-called": "off",
    "jest/prefer-to-have-been-called-times": "off",
    "jest/prefer-to-have-length": "off",
    "jest/prefer-todo": "off",
    "jest/require-hook": "off",
    "jest/require-to-throw-message": "off",
    "jest/require-top-level-describe": "off",
    "jest/valid-describe-callback": "off",
    "jest/valid-expect": "off",
    "jest/valid-expect-in-promise": "off",
    "jest/valid-title": "off",
    "unicorn/no-array-callback-reference": "error",

    "typescript/require-await": "error",
    "typescript/no-floating-promises": [
      "error",
      { ignoreVoid: false, checkThenables: true },
    ],
    "typescript/restrict-template-expressions": [
      "error",
      {
        allowAny: false,
        allowBoolean: false,
        allowNullish: false,
        allowRegExp: false,
        allowNumber: true,
        allowArray: false,
        allowNever: false,
      },
    ],
    "typescript/restrict-plus-operands": [
      "error",
      {
        allowAny: false,
        allowBoolean: false,
        allowNullish: false,
        allowNumberAndString: false,
        allowRegExp: false,
      },
    ],
    "react/jsx-key": [
      "error",
      {
        checkFragmentShorthand: true,
        warnOnDuplicates: true,
        checkKeyMustBeforeSpread: true,
      },
    ],
    "max-depth": ["error", MAX_BLOCK_DEPTH],
    "react/forward-ref-uses-ref": "error",
    "react/no-unknown-property": "error",
    "import/no-dynamic-require": "error",
    "unicorn/explicit-length-check": "error",
    "unicorn/no-nested-ternary": "error",
    // Biome owns numeric formatting, including fractional separator grouping.
    "unicorn/numeric-separators-style": "off",
    // Declaration merging needs an empty marker interface over a mapped record.
    "typescript/no-empty-interface": ["error", { allowSingleExtends: true }],
    "typescript/no-empty-object-type": [
      "error",
      { allowInterfaces: "with-single-extends" },
    ],
    // Compiler-aware analysis complements conventional exhaustive dependency checks.
    // The pinned implementation permits omitted stable useRef objects.
    "react/exhaustive-effect-dependencies": "error",
    // Oxc 1.89 rejects valid Promise.withResolvers<void>() / useMutation<void>()
    // even with allowInGenericTypeArguments. Biome noConfusingVoidType owns this.
    "typescript/no-invalid-void-type": "off",
    // Router redirects are documented control-flow sentinels, not error objects.
    "typescript/only-throw-error": [
      "error",
      {
        allowThrowingAny: false,
        allowThrowingUnknown: false,
        allowRethrowing: true,
        allow: [
          {
            from: "package",
            name: "Redirect",
            package: "@tanstack/router-core",
          },
        ],
      },
    ],
    "func-style": ["error", "declaration", { allowArrowFunctions: true }],
    "react/function-component-definition": [
      "error",
      {
        namedComponents: "function-declaration",
        unnamedComponents: "arrow-function",
      },
    ],
    "import/consistent-type-specifier-style": [
      "error",
      "prefer-top-level-if-only-type-imports",
    ],
    "no-use-before-define": "off",
    // Named Node builtins follow the same direct-import convention as browser modules.
    "unicorn/import-style": [
      "error",
      { styles: { "node:path": { named: true } } },
    ],
    // Non-null assertions are forbidden, not preferred over another unsafe cast.
    "typescript/non-nullable-type-assertion-style": "off",
    // TanStack file-route dynamic segments are framework-owned filename grammar.
    "unicorn/filename-case": ["error", { case: "kebabCase", ignore: ["^\\$"] }],
    // Intentional public composition exports are not improved by another barrel.
    "unicorn/prefer-export-from": "off",
    // Strict boolean expressions require explicit conversion of unknown/ReactNode.
    "no-extra-boolean-cast": "off",
    // Explicit fallback cases preserve exhaustiveness checks even with an open-wire default.
    "unicorn/no-useless-switch-case": "off",
    // DOM declarations assume every API exists; runtime feature detection must survive.
    // JSON.stringify is also declared string although unknown inputs can yield undefined.
    "typescript/no-unnecessary-condition": "off",
    // Module-scoped mock factories are stable; actual render-time identity is checked
    // by the React Compiler static-components rule and production compilation.
    "react/no-unstable-nested-components": "off",
    // Value-only lazy state gives editors/stores a stable per-mount lifetime.
    "react/hook-use-state": "off",
    // Playwright serializes evaluate callbacks: their helpers must stay inside.
    // React Compiler checks render-time function identity where it matters.
    "unicorn/consistent-function-scoping": "off",
    "shadcn/no-restyle": [
      "error",
      {
        allow: ["layout"],
        contracts: [
          {
            pattern: "^TooltipTrigger$",
            allow: [
              "layout",
              "typography",
              "color",
              "spacing",
              "shape",
              "effects",
              "motion",
            ],
          },
        ],
      },
    ],
    // TypeScript requires brackets for index signatures and explicit undefined returns.
    "typescript/dot-notation": [
      "error",
      { allowIndexSignaturePropertyAccess: true },
    ],
    "unicorn/no-useless-undefined": "off",
    // Property sorting can change insertion-order semantics; Biome sorts declarations.
    "sort-keys": "off",
    // Compiler implementation gaps are not actionable source defects.
    "react/todo": "off",
    // React Compiler owns closure and context-value memoization.
    "react/jsx-no-constructed-context-values": "off",
    // Runtime assertions and strict TypeScript own declared globals.
    "no-undef": "off",
    // Biome owns the same syntax/style checks, avoiding incompatible fixes.
    "unicorn/switch-case-braces": ["error", "avoid"],
    "typescript/array-type": ["error", { default: "array" }],
    "typescript/consistent-return": "error",
    // Void intentionally discards synchronous results; no-misused-promises guards async loss.
    "typescript/strict-void-return": "off",
    // Promise bridges/chains and reducers are valid APIs, not correctness defects.
    "promise/prefer-await-to-then": "off",
    "promise/prefer-await-to-callbacks": "off",
    "promise/avoid-new": "off",
    "unicorn/no-array-reduce": "off",
    // ARIA status/region semantics are not interchangeable with native output/section.
    "jsx-a11y/prefer-tag-over-role": "off",
    // Async functions may deliberately implement a Promise-returning contract.
    "require-await": "off",
    // async changes promise identity and rejection timing; an existing Promise is valid.
    "typescript/promise-function-async": "off",
    // Syntactic DOM method matching also rewrites Playwright Locators incorrectly.
    "unicorn/prefer-dom-node-dataset": "off",
    // PostgreSQL UTF8 identifiers are not Node/TextDecoder encoding aliases.
    "unicorn/text-encoding-identifier-case": "off",
    // CSS computed lengths include units ("1px"); Number and parseFloat differ.
    "unicorn/prefer-number-coercion": "off",
    "prefer-arrow-callback": ["error", { allowNamedFunctions: true }],

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
      // Pure value transformations have immutable inputs and stable exported contracts.
      // Platform adapters retain real capability checks and mutable resource handles.
      files: ["src/lib/domain/**/*.ts", "src/lib/pagination.ts"],
      rules: {
        "typescript/prefer-readonly-parameter-types": "error",
        "typescript/explicit-module-boundary-types": "error",
        "typescript/no-unnecessary-condition": "error",
        "no-restricted-imports": [
          "error",
          {
            patterns: [
              {
                group: ["@/**", "!@/lib/domain/**", "!@/lib/value-guards"],
                allowTypeImports: true,
                message:
                  "Pure value modules may only import domain values and shared value guards.",
              },
              {
                group: [
                  "../**",
                  "react",
                  "react/**",
                  "react-dom",
                  "react-dom/**",
                  "@connectrpc/**",
                  "@tanstack/**",
                  "zustand",
                  "zustand/**",
                ],
                allowTypeImports: true,
                message:
                  "Keep stateful adapters outside the pure domain role; use direct domain imports.",
              },
            ],
          },
        ],
        "no-restricted-globals": [
          "error",
          {
            globals: [
              "globalThis",
              "global",
              "window",
              "self",
              "document",
              "navigator",
              "location",
              "history",
              "localStorage",
              "sessionStorage",
              "indexedDB",
              "caches",
              "fetch",
              "reportError",
              "WebSocket",
              "Worker",
              "MessageChannel",
              "setTimeout",
              "setInterval",
              "requestAnimationFrame",
            ],
            checkGlobalObject: false,
          },
        ],
      },
    },
    {
      // Both primitive layers are authored UI; consumers cannot redefine appearance.
      // Consumers still get every rule; authors may define appearance here.
      files: ["src/components/querylane-ui/**", "src/components/ui/**"],
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
