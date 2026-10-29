import { version as redactCompatibilityVersion } from "@tanstack/redact";

type ReactCompilerMode = "annotation" | "infer";
type ReactRenderer = "react" | "redact";

// Exact aliases preserve subpath resolution and one renderer across dependencies.
// Keep Redact's packaged feature registration intact; no nano/feature stripping.
const REDACT_ALIASES = {
  react: "@tanstack/redact",
  "react/compiler-runtime": "@tanstack/redact/compiler-runtime",
  "react/jsx-dev-runtime": "@tanstack/redact/jsx-dev-runtime",
  "react/jsx-runtime": "@tanstack/redact/jsx-runtime",
  "react-dom": "@tanstack/redact/dom",
  "react-dom/client": "@tanstack/redact/dom-client",
  "react-dom/test-utils": "@tanstack/redact/dom-test-utils",
  scheduler: "@tanstack/redact/scheduler",
  "use-sync-external-store": "@tanstack/redact",
  "use-sync-external-store/with-selector": "@tanstack/redact",
  "use-sync-external-store/with-selector.js": "@tanstack/redact",
  "use-sync-external-store/shim": "@tanstack/redact",
  "use-sync-external-store/shim/index.js": "@tanstack/redact",
  "use-sync-external-store/shim/with-selector": "@tanstack/redact",
  "use-sync-external-store/shim/with-selector.js": "@tanstack/redact",
} satisfies Record<string, string>;

interface ResolveReactPerformanceModeOptions {
  env: Readonly<Record<string, string | undefined>>;
  isProduction: boolean;
}

interface ReactPerformanceMode {
  aliases: Record<string, string>;
  buildCacheKey: string;
  compiler: {
    compilationMode: ReactCompilerMode;
    panicThreshold: "none";
    target: "19";
  };
  reactScanEnabled: boolean;
  renderer: ReactRenderer;
}

function resolveRenderer(value: string | undefined): ReactRenderer {
  const renderer = (value ?? "") || "react";
  if (renderer === "react" || renderer === "redact") {
    return renderer;
  }
  throw new Error('QUERYLANE_RENDERER must be "react" or "redact"');
}

function resolveCompilerMode(value: string | undefined): ReactCompilerMode {
  const mode = (value ?? "") || "infer";
  if (mode === "annotation" || mode === "infer") {
    return mode;
  }

  throw new Error(
    'QUERYLANE_REACT_COMPILER_MODE must be "annotation" or "infer"'
  );
}

function resolveReactPerformanceMode({
  env,
  isProduction,
}: ResolveReactPerformanceModeOptions): ReactPerformanceMode {
  const compilerMode = resolveCompilerMode(
    env["QUERYLANE_REACT_COMPILER_MODE"]
  );
  const reactScanEnabled = env["QUERYLANE_REACT_SCAN"] === "1";
  const renderer = resolveRenderer(env["QUERYLANE_RENDERER"]);

  if (reactScanEnabled && isProduction) {
    throw new Error(
      "React Scan is local-development tooling and cannot be included in a production build"
    );
  }

  const rendererCacheKey =
    renderer === "redact"
      ? `redact-react-${redactCompatibilityVersion}`
      : "react";

  return {
    aliases:
      renderer === "redact"
        ? Object.fromEntries(
            Object.entries(REDACT_ALIASES).map(([specifier, target]) => [
              `${specifier}$`,
              target,
            ])
          )
        : {},
    buildCacheKey: `renderer-${rendererCacheKey}:react-compiler-${compilerMode}`,
    compiler: {
      compilationMode: compilerMode,
      panicThreshold: "none",
      target: "19",
    },
    reactScanEnabled,
    renderer,
  };
}

export { resolveReactPerformanceMode };
