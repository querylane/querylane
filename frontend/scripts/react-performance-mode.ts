import path from "node:path";
import type { Rspack } from "@rsbuild/core";

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
  profile:
    | {
        root: string;
        output: string;
        cache: string;
        identity: {
          revision: string;
          sourceDigest: string;
          configDigest: string;
        };
      }
    | undefined;
  reactScanEnabled: boolean;
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
function isolatedRoot(root: string | undefined): string | undefined {
  if (root === undefined || root.length === 0 || !path.isAbsolute(root)) {
    return undefined;
  }
  const normalized = path.resolve(root);
  if (normalized === path.parse(normalized).root) {
    return undefined;
  }
  const frontend = path.resolve(import.meta.dirname, "..");
  return path.relative(frontend, normalized).startsWith(`..${path.sep}`)
    ? normalized
    : undefined;
}
const REVISION = /^[a-f\d]{40}$/u;
const DIGEST = /^[a-f\d]{64}$/u;
function profileIdentity(env: Readonly<Record<string, string | undefined>>) {
  const revision = env["QUERYLANE_REACT_PROFILE_REVISION"] ?? "";
  const sourceDigest = env["QUERYLANE_REACT_PROFILE_SOURCE_DIGEST"] ?? "";
  const configDigest = env["QUERYLANE_REACT_PROFILE_CONFIG_DIGEST"] ?? "";
  if (
    !(
      REVISION.test(revision) &&
      DIGEST.test(sourceDigest) &&
      DIGEST.test(configDigest)
    )
  ) {
    throw new Error(
      "Profiling requires identified revision, source and configuration digests"
    );
  }
  return { revision, sourceDigest, configDigest };
}
function resolveProfile({
  env,
  isProduction,
}: ResolveReactPerformanceModeOptions): ReactPerformanceMode["profile"] {
  const requested = env["QUERYLANE_REACT_PROFILE"];
  if (requested !== undefined && requested !== "0" && requested !== "1") {
    throw new Error("QUERYLANE_REACT_PROFILE must be 0 or 1");
  }
  if (requested !== "1") {
    return undefined;
  }
  const root = isolatedRoot(env["QUERYLANE_REACT_PROFILE_ROOT"]);
  if (!(isProduction && root !== undefined)) {
    throw new Error(
      "React profiling requires production mode and an absolute output root outside frontend"
    );
  }
  if (
    [env["QUERYLANE_REACT_SCAN"], env["QUERYLANE_VISUAL_HARNESS"]].includes(
      "1"
    ) ||
    Boolean(env["RSDOCTOR"])
  ) {
    throw new Error(
      "React profiling cannot share diagnostic or harness outputs"
    );
  }
  return {
    identity: profileIdentity(env),
    root,
    output: path.join(root, "dist"),
    cache: path.join(root, "cache"),
  };
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
  const profile = resolveProfile({ env, isProduction });
  return {
    profile,
    buildCacheKey: `react-compiler-${compilerMode}${profile ? ":react-profile-v1" : ""}`,
    compiler: {
      compilationMode: compilerMode,
      panicThreshold: "none",
      target: "19",
    },
    reactScanEnabled,
  };
}
const DIAGNOSTIC_REACT_MODULE =
  /react-dom(?:-client)?[/-]profiling|react-dom\/profiling|react-profile-|react-scan[/]/u;
// A normal-output contract, independent of diagnostic reports and byte caps.
function assertNormalReactModules(identifiers: Iterable<string>) {
  for (const identifier of identifiers) {
    if (DIAGNOSTIC_REACT_MODULE.test(identifier.replaceAll("\\", "/"))) {
      throw new Error(
        `Diagnostic React module in normal output: ${identifier}`
      );
    }
  }
}
const normalReactOutputContract = {
  apply(compiler: Rspack.Compiler) {
    compiler.hooks.compilation.tap(
      "normal-react-output-contract",
      (compilation) => {
        compilation.hooks.finishModules.tap(
          "normal-react-output-contract",
          (modules) => {
            assertNormalReactModules(
              Array.from(modules, (module) => module.identifier())
            );
          }
        );
      }
    );
  },
};

export {
  assertNormalReactModules,
  normalReactOutputContract,
  resolveReactPerformanceMode,
};
