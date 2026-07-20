type ReactCompilerMode = "annotation" | "infer";

interface ResolveReactPerformanceModeOptions {
  env: Readonly<Record<string, string | undefined>>;
  isProduction: boolean;
}

interface ReactPerformanceMode {
  buildCacheKey: string;
  compiler: {
    compilationMode: ReactCompilerMode;
    panicThreshold: "none";
    target: "19";
  };
  reactScanEnabled: boolean;
}

function resolveCompilerMode(value: string | undefined): ReactCompilerMode {
  const mode = value || "infer";
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

  if (reactScanEnabled && isProduction) {
    throw new Error(
      "React Scan is local-development tooling and cannot be included in a production build"
    );
  }

  return {
    buildCacheKey: `react-compiler-${compilerMode}`,
    compiler: {
      compilationMode: compilerMode,
      panicThreshold: "none",
      target: "19",
    },
    reactScanEnabled,
  };
}

export { resolveReactPerformanceMode };
