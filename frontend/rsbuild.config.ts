import { existsSync } from "node:fs";
import path from "node:path";
import process, { env } from "node:process";
import { defineConfig } from "@rsbuild/core";
import { pluginReact } from "@rsbuild/plugin-react";
import { pluginTailwindcss } from "@rsbuild/plugin-tailwindcss";
import { RsdoctorRspackPlugin } from "@rsdoctor/core";
import { createEnv } from "@t3-oss/env-core";
import { tanstackRouter } from "@tanstack/router-plugin/rspack";
import { pluginDevtoolsJson } from "rsbuild-plugin-devtools-json";
import { z } from "zod";
import {
  createBuildCacheDigest,
  createPreconnectOrigins,
  managedSplitChunksConfig,
  productionOptimizationOverrides,
} from "./rsbuild.performance.ts";
import { resolveReactPerformanceMode } from "./scripts/react-performance-mode.ts";
import { bundleContractRules } from "./scripts/rsdoctor-bundle-contracts.ts";

const RSPACK_BUILD_CACHE_DIRECTORY = "node_modules/.cache/rsbuild";
const RSPACK_BUILD_DEPENDENCIES = [
  path.resolve(import.meta.dirname, ".browserslistrc"),
  path.resolve(import.meta.dirname, "bun.lock"),
  path.resolve(import.meta.dirname, "index.html"),
  path.resolve(import.meta.dirname, "package.json"),
  path.resolve(import.meta.dirname, "postcss.config.mjs"),
  path.resolve(import.meta.dirname, "tsconfig.json"),
  path.resolve(import.meta.dirname, "tsconfig.ui.json"),
];
type RsdoctorPluginOptions = NonNullable<
  ConstructorParameters<
    typeof RsdoctorRspackPlugin<typeof bundleContractRules>
  >[0]
>;

if (existsSync(".env") && typeof process.loadEnvFile === "function") {
  process.loadEnvFile();
}

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
const isProduction =
  buildEnv.NODE_ENV === "production" || process.argv.includes("build");
const reactPerformanceMode = resolveReactPerformanceMode({
  env,
  isProduction,
});

const buildCacheDigest = [
  ...createBuildCacheDigest({
    env,
    rsdoctorEnabled: enableRsdoctor,
  }),
  reactPerformanceMode.buildCacheKey,
];
const preconnectOrigins = createPreconnectOrigins({
  apiBaseUrl: buildEnv.PUBLIC_API_BASE_URL,
  isProduction: buildEnv.NODE_ENV === "production",
});

const rsdoctorPluginOptions = {
  disableClientServer: true,
  features: {
    bundle: true,
    loader: true,
    plugins: true,
    resolver: true,
    treeShaking: true,
  },
  linter: {
    extends: bundleContractRules,
    rules: {
      "cross-chunks-package": "off",
      "duplicate-package": ["Warn", { checkVersion: "prepatch", ignore: [] }],
      "esm-resolved-to-cjs": ["Warn", { ignore: [] }],
      "tree-shaking-side-effects-only": [
        "Warn",
        { ignore: ["src/components/ui/textarea.tsx"], include: [] },
      ],
    },
  },
  output: {
    mode: "brief",
    options: {
      type: ["html", "json"],
    },
  },
} satisfies RsdoctorPluginOptions;

export default defineConfig({
  dev: {
    lazyCompilation: false,
  },
  html: {
    tags: [
      {
        append: false,
        attrs: { src: "/theme-init.js" },
        head: true,
        publicPath: false,
        tag: "script",
      },
      ...(reactPerformanceMode.reactScanEnabled
        ? [
            {
              append: false,
              attrs: { src: "/react-scan.js" },
              head: true,
              publicPath: false,
              tag: "script",
            },
          ]
        : []),
    ],
    template: "./index.html",
  },
  output: {
    dataUriLimit: { font: 0 },
    ...(reactPerformanceMode.reactScanEnabled
      ? {
          copy: [
            {
              from: path.resolve(
                import.meta.dirname,
                "node_modules/react-scan/dist/auto.global.js"
              ),
              to: "react-scan.js",
            },
          ],
        }
      : {}),
    sourceMap: {
      js:
        buildEnv.NODE_ENV === "production"
          ? "hidden-source-map"
          : "eval-cheap-module-source-map",
    },
  },
  performance: {
    ...(preconnectOrigins.length > 0 ? { preconnect: preconnectOrigins } : {}),
    preload: {
      include: /\/sans-core(?:\.[\w]+)?\.woff2$/u,
      type: "all-assets",
    },
    buildCache: {
      buildDependencies: RSPACK_BUILD_DEPENDENCIES,
      cacheDigest: buildCacheDigest,
      cacheDirectory: RSPACK_BUILD_CACHE_DIRECTORY,
    },
    removeConsole: ["log", "info", "warn", "table", "group"],
  },
  plugins: [
    pluginReact({
      reactCompiler: reactPerformanceMode.compiler,
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
        tanstackRouter({
          autoCodeSplitting: true,
          codeSplittingOptions: {
            defaultBehavior: [
              ["component", "errorComponent", "notFoundComponent"],
            ],
          },
          target: "react",
        })
      );

      if (config.mode === "production") {
        config.optimization = {
          ...config.optimization,
          ...productionOptimizationOverrides,
        };
      }

      config.experiments ??= {};
      config.experiments.asyncWebAssembly = true;
      config.experiments.futureDefaults = true;
      config.experiments.nativeWatcher = true;
      config.experiments.pureFunctions = config.mode === "production";

      if (enableRsdoctor) {
        config.plugins.push(new RsdoctorRspackPlugin(rsdoctorPluginOptions));
      }
    },
  },
});
