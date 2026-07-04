import { createRequire } from "node:module";
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

const reactCompilerConfig = {
  target: "19" as const,
};

const KIB = 1024;
const ENFORCED_SPLIT_SIZE_KIB = 80;
const MIN_SPLIT_SIZE_KIB = 20;
const MAX_ASYNC_CHUNK_REQUESTS = 30;
const MAX_INITIAL_CHUNK_REQUESTS = 20;
const RSPACK_BUILD_CACHE_DIRECTORY = "node_modules/.cache/rsbuild";
const SENTRY_APPLICATION_KEY = "querylane-frontend";
const RSPACK_BUILD_DEPENDENCIES = [
  path.resolve(import.meta.dirname, ".browserslistrc"),
  path.resolve(import.meta.dirname, "bun.lock"),
  path.resolve(import.meta.dirname, "package.json"),
  path.resolve(import.meta.dirname, "rsbuild.config.ts"),
  path.resolve(import.meta.dirname, "tsconfig.json"),
];

dotenv.config();

const buildEnv = createEnv({
  isServer: true,
  runtimeEnv: env,
  server: {
    NODE_ENV: z.enum(["development", "production", "test"]).optional(),
    PUBLIC_POSTHOG_HOST: z.string().optional(),
    PUBLIC_POSTHOG_KEY: z.string().optional(),
    PUBLIC_SENTRY_ENVIRONMENT: z.string().optional(),
    PUBLIC_SENTRY_RELEASE: z.string().optional(),
    RSDOCTOR: z.string().optional(),
    RSPACK_EXPERIMENT_FUTURE_DEFAULTS: z.string().optional(),
    SENTRY_AUTH_TOKEN: z.string().optional(),
    SENTRY_ORG: z.string().optional(),
    SENTRY_PROJECT: z.string().optional(),
  },
});

const enableRsdoctor = Boolean(buildEnv.RSDOCTOR);
const posthogPreconnect =
  buildEnv.NODE_ENV === "production" && buildEnv.PUBLIC_POSTHOG_KEY
    ? buildEnv.PUBLIC_POSTHOG_HOST?.trim() || "https://us.i.posthog.com"
    : undefined;
const enableRspackFutureDefaults =
  buildEnv.RSPACK_EXPERIMENT_FUTURE_DEFAULTS !== "0";
const sentryAuthToken = buildEnv.SENTRY_AUTH_TOKEN;
const sentryEnvironment = buildEnv.PUBLIC_SENTRY_ENVIRONMENT;
const sentryOrg = buildEnv.SENTRY_ORG;
const sentryProject = buildEnv.SENTRY_PROJECT;
const sentryReleaseName = buildEnv.PUBLIC_SENTRY_RELEASE;
const enableSentryPlugin = buildEnv.NODE_ENV === "production";
const require = createRequire(import.meta.url);

const publicVars = Object.entries(env).reduce<Record<string, string>>(
  (acc, [key, value]) => {
    if (key.startsWith("PUBLIC_") && typeof value === "string") {
      const serializedValue = JSON.stringify(value);
      acc[`process.env.${key}`] = serializedValue;
      acc[`import.meta.env.${key}`] = serializedValue;
    }
    return acc;
  },
  {
    "import.meta.env.PUBLIC_API_BASE_URL": JSON.stringify(
      env["PUBLIC_API_BASE_URL"] ?? ""
    ),
  }
);

const buildCacheDigest = [
  JSON.stringify(
    Object.fromEntries(
      Object.entries(env)
        .filter(
          ([key, value]) =>
            key.startsWith("PUBLIC_") && typeof value === "string"
        )
        .sort(([leftKey], [rightKey]) => leftKey.localeCompare(rightKey))
    )
  ),
  buildEnv.NODE_ENV ?? "",
  String(enableRspackFutureDefaults),
];

const rsdoctorPluginOptions = {
  disableClientServer: true,
  features: {
    // Show which dependency or route group grows Querylane's JS payload.
    bundle: true,
    // Surface expensive loader transforms when frontend build time regresses.
    loader: true,
    // Attribute bundle changes to router, Sentry, Tailwind, and React plugins.
    plugins: true,
    // Catch slow or CJS-fallback module resolution before it hits CI.
    resolver: true,
    // Verify risky Rspack export analysis actually removes unused UI/runtime code.
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
};

export default defineConfig({
  dev: {
    // Defers compiling unused routes/modules until first local access.
    // First visit to a cold route can be a little slower, but startup stays
    // faster and production output is unchanged.
    lazyCompilation: true,
  },
  html: {
    template: "./index.html",
  },
  output: {
    polyfill: "off",
    sourceMap: {
      js:
        buildEnv.NODE_ENV === "production"
          ? "hidden-source-map"
          : "eval-cheap-module-source-map",
    },
  },
  performance: {
    ...(posthogPreconnect ? { preconnect: [posthogPreconnect] } : {}),
    buildCache: {
      buildDependencies: RSPACK_BUILD_DEPENDENCIES,
      cacheDigest: buildCacheDigest,
      cacheDirectory: RSPACK_BUILD_CACHE_DIRECTORY,
    },
    // Strip debug-only console calls from production bundles so ad hoc logs do
    // not become support diagnostics by accident. Keep warn/error for real
    // diagnostics and Sentry console integrations.
    removeConsole: ["log", "info", "table", "group"],
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
    conditionNames: [
      "import",
      "module",
      "browser",
      buildEnv.NODE_ENV === "production" ? "production" : "development",
      "...",
    ],
    mainFields: ["module", "browser", "main", "..."],
  },
  source: {
    define: publicVars,
    entry: {
      index: "./src/main.tsx",
    },
    tsconfigPath: "./tsconfig.json",
  },
  splitChunks: {
    cacheGroups: {
      dataGrid: {
        chunks: "async",
        name: "data-grid",
        priority: 32,
        reuseExistingChunk: true,
        test: /[/\\]node_modules[/\\]react-data-grid[/\\]/,
      },
      posthog: {
        chunks: "async",
        name: "posthog",
        priority: 35,
        reuseExistingChunk: true,
        test: /[/\\]node_modules[/\\]posthog-js[/\\]/,
      },
      protobuf: {
        chunks: "async",
        name: "protobuf",
        priority: 20,
        reuseExistingChunk: true,
        test: /[/\\]node_modules[/\\](?:@bufbuild|@connectrpc)[/\\]/,
      },
      sentry: {
        chunks: "async",
        name: "sentry",
        priority: 35,
        reuseExistingChunk: true,
        test: /[/\\]node_modules[/\\](?:@sentry|@sentry-internal)[/\\]/,
      },
      sharedUi: {
        chunks: "async",
        minChunks: 2,
        name: "shared-ui",
        priority: 28,
        reuseExistingChunk: true,
        test: /[/\\]src[/\\]components[/\\]ui[/\\]/,
      },
      ui: {
        chunks: "async",
        name: "ui-vendor",
        priority: 10,
        reuseExistingChunk: true,
        test: /[/\\]node_modules[/\\](?:@base-ui|lucide-react)[/\\]/,
      },
    },
    chunks: "all",
    enforceSizeThreshold: ENFORCED_SPLIT_SIZE_KIB * KIB,
    maxAsyncRequests: MAX_ASYNC_CHUNK_REQUESTS,
    maxInitialRequests: MAX_INITIAL_CHUNK_REQUESTS,
    minSize: MIN_SPLIT_SIZE_KIB * KIB,
    preset: "default",
  },
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
      if (enableSentryPlugin && sentryAuthToken && sentryOrg && sentryProject) {
        const { sentryWebpackPlugin } = require("@sentry/webpack-plugin");
        config.plugins.push(
          sentryWebpackPlugin({
            applicationKey: SENTRY_APPLICATION_KEY,
            authToken: sentryAuthToken,
            bundleSizeOptimizations: {
              excludeDebugStatements: true,
              excludeReplayIframe: true,
              excludeReplayShadowDom: true,
            },
            org: sentryOrg,
            project: sentryProject,
            release: {
              ...(sentryEnvironment
                ? { deploy: { env: sentryEnvironment } }
                : {}),
              name: sentryReleaseName,
            },
            // Production builds emit hidden source maps for upload only: bundle
            // comments do not advertise them, and the plugin deletes `.map`
            // files after upload so implementation sources are not shipped.
            sourcemaps: {
              assets: "./dist/**/*.{js,map}",
              filesToDeleteAfterUpload: "./dist/**/*.map",
            },
            telemetry: false,
          })
        );
      }
      config.optimization ??= {};
      // Avoid wrapping the entry chunk in an IIFE so Rspack can tree-shake the
      // Querylane bootstrap graph more aggressively.
      config.optimization.avoidEntryIife = true;
      // Keep export names stable across rebuilds for cache-friendly PR size
      // diffs while still allowing minification.
      config.optimization.mangleExports = "deterministic";
      // Stable chunk ids make bundle-budget comparisons meaningful between
      // dependency-bump commits.
      config.optimization.chunkIds = "deterministic";
      // Scope-hoist route-adjacent modules to cut wrapper overhead in hot paths.
      config.optimization.concatenateModules = true;
      // Inline simple re-export bindings so shared UI/helper barrels vanish from
      // production chunks when unused.
      config.optimization.inlineExports = true;
      // Let Rspack inspect nested export usage in objects/functions before
      // marking whole modules live.
      config.optimization.innerGraph = true;
      // Stable module ids reduce cache churn when dependency order changes.
      config.optimization.moduleIds = "deterministic";
      // Collapse duplicate async chunks created by route code-splitting.
      config.optimization.mergeDuplicateChunks = true;
      // Compute provided exports so Rspack can prove unused exports dead.
      config.optimization.providedExports = true;
      // Hash final content after optimization, not source order, for reliable
      // long-term caching.
      config.optimization.realContentHash = true;
      // Respect package sideEffects metadata so third-party dead code drops out.
      config.optimization.sideEffects = true;
      // Mark used exports for tree-shaking and Rsdoctor tree-shaking reports.
      config.optimization.usedExports = true;

      // Cache incremental compiler state silently; local rebuilds get faster
      // without noisy experimental logging in CI output.
      config.incremental = "advance-silent";
      config.experiments ??= {};
      // Allow deferred import lowering so route chunks can delay expensive async
      // module evaluation until actually navigated to.
      config.experiments.deferImport = true;
      // Soak upcoming Rspack defaults behind an env kill switch while this PR is
      // explicitly validating risky compiler behavior.
      config.experiments.futureDefaults = enableRspackFutureDefaults;
      // Use Rspack's native watcher for faster local invalidation on large
      // frontend trees.
      config.experiments.nativeWatcher = true;
      // Enable pure-function analysis so helper calls marked pure can be removed
      // from production bundles.
      config.experiments.pureFunctions = true;
      // Use the Rspack runtime path rather than webpack compatibility runtime to
      // match the bundler we ship and measure.
      config.experiments.runtimeMode = "rspack";

      if (enableRsdoctor) {
        config.plugins.push(
          // Contextually typing the options against RsdoctorRspackPluginOptions
          // overflows tsgo recursion (UnionToTuple in @rsdoctor/core rule types),
          // so the options object cannot be checked against the plugin generic.
          new RsdoctorRspackPlugin(rsdoctorPluginOptions as never)
        );
      }
    },
  },
});
