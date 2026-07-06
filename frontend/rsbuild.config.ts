import path from "node:path";
import { env } from "node:process";
import { defineConfig } from "@rsbuild/core";
import { pluginReact } from "@rsbuild/plugin-react";
import { pluginTailwindcss } from "@rsbuild/plugin-tailwindcss";
import { RsdoctorRspackPlugin } from "@rsdoctor/rspack-plugin";
import { createEnv } from "@t3-oss/env-core";
import { TanStackRouterRspack } from "@tanstack/router-plugin/rspack";
import dotenv from "dotenv";
import { pluginDevtoolsJson } from "rsbuild-plugin-devtools-json";
import { z } from "zod/v4";
import {
  createBuildCacheDigest,
  createPreconnectOrigins,
  managedSplitChunksConfig,
  productionOptimizationOverrides,
} from "./rsbuild.performance";

const reactCompilerConfig = {
  target: "19" as const,
};

const RSPACK_BUILD_CACHE_DIRECTORY = "node_modules/.cache/rsbuild";
const RSPACK_BUILD_DEPENDENCIES = [
  path.resolve(import.meta.dirname, ".browserslistrc"),
  path.resolve(import.meta.dirname, "bun.lock"),
  path.resolve(import.meta.dirname, "index.html"),
  path.resolve(import.meta.dirname, "package.json"),
  path.resolve(import.meta.dirname, "postcss.config.mjs"),
  path.resolve(import.meta.dirname, "rsbuild.config.ts"),
  path.resolve(import.meta.dirname, "tsconfig.json"),
  path.resolve(import.meta.dirname, "tsconfig.ui.json"),
];
type RsdoctorPluginOptions = NonNullable<
  ConstructorParameters<typeof RsdoctorRspackPlugin<[]>>[0]
>;

dotenv.config();

const buildEnv = createEnv({
  isServer: true,
  runtimeEnv: env,
  server: {
    NODE_ENV: z.enum(["development", "production", "test"]).optional(),
    PUBLIC_API_BASE_URL: z.string().optional(),
    RSDOCTOR: z.string().optional(),
  },
});

const enableRsdoctor = Boolean(buildEnv.RSDOCTOR);

const buildCacheDigest = createBuildCacheDigest({
  env,
  rsdoctorEnabled: enableRsdoctor,
});
const preconnectOrigins = createPreconnectOrigins({
  apiBaseUrl: buildEnv.PUBLIC_API_BASE_URL,
  isProduction: buildEnv.NODE_ENV === "production",
});

const rsdoctorPluginOptions = {
  disableClientServer: true,
  features: {
    // Show which dependency or route group grows Querylane's JS payload.
    bundle: true,
    // Surface expensive loader transforms when frontend build time regresses.
    loader: true,
    // Attribute bundle changes to router, Tailwind, and React plugins.
    plugins: true,
    // Catch slow or CJS-fallback module resolution before it hits CI.
    resolver: true,
    // Verify Rspack's production tree-shaking actually removes unused
    // UI/runtime code.
    treeShaking: true,
  },
  linter: {
    rules: {
      // The app itself is intentionally split by TanStack Router route chunks;
      // Rsdoctor models local src files as the frontend-new package and reports
      // expected route CSS duplication as cross-package duplication. The rule's
      // ignore option is currently not applied by Rsdoctor, so disable it.
      "cross-chunks-package": "off",
      // Ignore patch-level transitive duplicates; those are package manager
      // resolution noise, while minor/major duplicates remain visible.
      "duplicate-package": ["Warn", { checkVersion: "prepatch", ignore: [] }],
      // Keep E1009 enabled without package suppressions. Rsdoctor 1.5.12
      // fixed known subpath false positives, so new findings should expose
      // real resolution or package export regressions.
      "esm-resolved-to-cjs": ["Warn", { ignore: [] }],
      // TanStack Router's code-splitter proxy can make a used component import
      // look side-effect-only in Rsdoctor's graph. Keep third-party checking on,
      // but ignore this known local false positive.
      "tree-shaking-side-effects-only": [
        "Warn",
        { ignore: ["src/components/ui/textarea.tsx"], include: [] },
      ],
    },
  },
  output: {
    mode: "brief",
    options: {
      type: ["json"],
    },
  },
} satisfies RsdoctorPluginOptions;

export default defineConfig({
  dev: {
    // Compile the whole app up front so navigating between routes never triggers
    // an on-demand compile mid-session. Costs a couple of extra seconds at
    // `bun run dev` startup in exchange for no per-navigation "fresh compile"
    // stalls. Flip back to true if cold-start time becomes the bigger annoyance.
    lazyCompilation: false,
  },
  html: {
    template: "./index.html",
  },
  performance: {
    ...(preconnectOrigins.length > 0 ? { preconnect: preconnectOrigins } : {}),
    buildCache: {
      buildDependencies: RSPACK_BUILD_DEPENDENCIES,
      cacheDigest: buildCacheDigest,
      cacheDirectory: RSPACK_BUILD_CACHE_DIRECTORY,
    },
    // Strip direct ad hoc diagnostics from production bundles while thrown
    // errors and explicit error handling stay intact.
    removeConsole: ["log", "info", "warn", "table", "group"],
  },
  plugins: [
    pluginReact({
      reactCompiler: reactCompilerConfig,
    }),
    pluginTailwindcss(),
    pluginDevtoolsJson(),
  ],
  resolve: {
    alias: {
      "@": path.resolve(import.meta.dirname, "./src"),
    },
  },
  source: {
    // PUBLIC_-prefixed env vars are exposed on import.meta.env automatically by
    // rsbuild (see rsbuild env-vars docs); src/env.ts reads them and defaults
    // PUBLIC_API_BASE_URL to "" via zod, so no manual `define` is needed.
    entry: {
      index: "./src/main.tsx",
    },
    tsconfigPath: "./tsconfig.json",
  },
  splitChunks: managedSplitChunksConfig,
  tools: {
    rspack(config) {
      config.plugins ??= [];
      config.plugins.push(
        TanStackRouterRspack({
          autoCodeSplitting: true,
          codeSplittingOptions: {
            defaultBehavior: [
              ["loader"],
              ["component"],
              ["pendingComponent"],
              ["errorComponent"],
              ["notFoundComponent"],
            ],
          },
          target: "react",
        })
      );
      // Rspack's native watcher gives faster local invalidation on large
      // frontend trees. It is a no-op for one-shot production builds. Everything
      // else about bundle optimization is left to Rspack's mode-aware defaults:
      // `rsbuild build` runs `mode: 'production'`, which already enables
      // tree-shaking, module concatenation, deterministic ids, etc., and
      // `rsbuild dev` disables them — so we don't hand-force (and previously
      // mis-force) those into dev.

      if (config.mode === "production") {
        config.optimization = {
          ...config.optimization,
          ...productionOptimizationOverrides,
        };
      }

      config.experiments ??= {};
      config.experiments.nativeWatcher = true;

      if (enableRsdoctor) {
        config.plugins.push(new RsdoctorRspackPlugin(rsdoctorPluginOptions));
      }
    },
  },
});
