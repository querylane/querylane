import path from "node:path";
import tailwindcss from "@tailwindcss/vite";

const VITEST_DEFINE_ENTRIES = [["__API_BASE_URL__", '""']] as const;

export const VITEST_DEFINES = Object.fromEntries(VITEST_DEFINE_ENTRIES);

export const VITEST_TIMEOUTS = {
  browser: 10_000,
  integration: 5000,
  unit: 3000,
} as const;

export const VITEST_SLOW_TEST_THRESHOLDS = {
  browser: 250,
  integration: 100,
  unit: 50,
} as const;

export const VITEST_SETUP_FILES = {
  browser: "./vitest.browser.setup.ts",
  dom: "./vitest.setup.ts",
} as const;

export const VITEST_PLUGIN_NAMES = ["tailwindcss"] as const;

export const VITEST_BROWSER_OPTIMIZE_DEPS = [
  "@base-ui/react/alert-dialog",
  "@base-ui/react/avatar",
  "@base-ui/react/checkbox",
  "@base-ui/react/combobox",
  "@base-ui/react/dialog",
  "@base-ui/react/menu",
  "@base-ui/react/popover",
  "@base-ui/react/progress",
  "@base-ui/react/select",
  "@base-ui/react/separator",
  "@base-ui/react/switch",
  "@base-ui/react/tabs",
  "@base-ui/react/tooltip",
  "@bufbuild/protobuf",
  "@bufbuild/protobuf/reflect",
  "@connectrpc/connect",
  "@connectrpc/connect-query",
  "@connectrpc/connect-query-core",
  "@shikijs/langs/sql",
  "@shikijs/themes/github-dark",
  "@shikijs/themes/github-light",
  "@t3-oss/env-core",
  "@tanstack/react-query",
  "@tanstack/react-router",
  "@tanstack/react-table",
  "chrono-node",
  "cmdk",
  "date-fns",
  "lucide-react",
  "react",
  "react-data-grid",
  "react-dom",
  "shiki/core",
  "shiki/engine/javascript",
  "sonner",
  "vitest-browser-react",
  "zod",
  "zustand",
  "zustand/middleware",
  "zustand/react/shallow",
] as const;

export function createVitestBaseConfig() {
  return {
    css: {
      postcss: {},
    },
    define: VITEST_DEFINES,
    plugins: [tailwindcss()],
    resolve: {
      alias: {
        "@": path.resolve(import.meta.dirname, "./src"),
      },
    },
  };
}
