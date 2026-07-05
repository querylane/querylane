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
type RsdoctorPluginOptions = NonNullable<
  ConstructorParameters<typeof RsdoctorRspackPlugin<[]>>[0]
>;

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
const sentryAuthToken = buildEnv.SENTRY_AUTH_TOKEN;
const sentryEnvironment = buildEnv.PUBLIC_SENTRY_ENVIRONMENT;
const sentryOrg = buildEnv.SENTRY_ORG;
const sentryProject = buildEnv.SENTRY_PROJECT;
const sentryReleaseName = buildEnv.PUBLIC_SENTRY_RELEASE;
const enableSentryPlugin = buildEnv.NODE_ENV === "production";
const require = createRequire(import.meta.url);

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
  output: {
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
      // Rspack's native watcher gives faster local invalidation on large
      // frontend trees. It is a no-op for one-shot production builds. Everything
      // else about bundle optimization is left to Rspack's mode-aware defaults:
      // `rsbuild build` runs `mode: 'production'`, which already enables
      // tree-shaking, module concatenation, deterministic ids, etc., and
      // `rsbuild dev` disables them — so we don't hand-force (and previously
      // mis-force) those into dev.
      config.experiments ??= {};
      config.experiments.nativeWatcher = true;

      if (enableRsdoctor) {
        config.plugins.push(new RsdoctorRspackPlugin(rsdoctorPluginOptions));
      }
    },
  },
});
