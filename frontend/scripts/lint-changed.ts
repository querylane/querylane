import { spawnSync } from "node:child_process";
import { existsSync, statSync } from "node:fs";
import { env, exit } from "node:process";

const DEFAULT_BASE_REF = "origin/main";
const FRONTEND_PREFIX = "frontend/";
const FRONTEND_GIT_PATHSPEC = ":(top)frontend";
const FAILURE_EXIT_CODE = 1;
const SUCCESS_EXIT_CODE = 0;
const EXTENSION_PATTERN = /\.[^.]+$/u;
const GIT_CHANGED_FILE_FILTER = ["ACMRT", "UXB"].join("");

const LINTABLE_EXTENSIONS = new Set([
  ".cjs",
  ".css",
  ".html",
  ".js",
  ".json",
  ".jsonc",
  ".jsx",
  ".mjs",
  ".ts",
  ".tsx",
]);

const GENERATED_OR_REGISTRY_PREFIXES = ["src/components/ui/", "src/protogen/"];
const GENERATED_FILES = new Set(["src/routeTree.gen.ts"]);
const FULL_STATIC_ANALYSIS_PATH_PATTERN =
  /^(?:\.github\/workflows\/frontend-ci\.yml|frontend\/(?:biome\.jsonc|bun\.lock|doctor\.config\.ts|package\.json|react-doctor\.config\.json|tsconfig(?:\.[^/]+)?\.json|scripts\/(?:lint-changed|run-react-doctor-ci|strict-tooling-policy\.unit\.test)\.ts))$/u;

interface FileSystemAccess {
  existsSync: (path: string) => boolean;
  statSync: (path: string) => { isFile: () => boolean };
}

interface CommandResult {
  status: number | null;
  stdout: string;
}

interface CommandRunner {
  run: (command: string, args: string[]) => CommandResult;
}

const nodeFileSystem: FileSystemAccess = { existsSync, statSync };

const childProcessRunner: CommandRunner = {
  run: (command, args) => {
    const result = spawnSync(command, args, {
      encoding: "utf8",
      stdio: ["ignore", "pipe", "inherit"],
    });
    return { status: result.status, stdout: result.stdout };
  },
};

function baseRefFromEnvironment(
  environment: Record<string, string | undefined>
) {
  if (environment["QUALITY_BASE_REF"]) {
    return environment["QUALITY_BASE_REF"];
  }
  if (environment["GITHUB_BASE_REF"]) {
    return `origin/${environment["GITHUB_BASE_REF"]}`;
  }
  return DEFAULT_BASE_REF;
}

function frontendRelativePath(repoPath: string): string | null {
  if (repoPath.startsWith(FRONTEND_PREFIX)) {
    return repoPath.slice(FRONTEND_PREFIX.length);
  }
  return repoPath.startsWith("../") ? null : repoPath;
}

function hasLintableExtension(path: string) {
  return LINTABLE_EXTENSIONS.has(path.match(EXTENSION_PATTERN)?.[0] ?? "");
}

function isGeneratedOrRegistryPath(path: string) {
  return (
    GENERATED_FILES.has(path) ||
    GENERATED_OR_REGISTRY_PREFIXES.some((prefix) => path.startsWith(prefix))
  );
}

function requiresFullStaticAnalysis(repoPaths: readonly string[]) {
  return repoPaths.some((path) => FULL_STATIC_ANALYSIS_PATH_PATTERN.test(path));
}

function requiresFullStaticAnalysisFromBase(baseRef: string) {
  return requiresFullStaticAnalysis(
    changedRepoFiles(baseRef, childProcessRunner)
  );
}

function lintableChangedFiles(
  repoPaths: readonly string[],
  fileSystem: FileSystemAccess = nodeFileSystem
) {
  return repoPaths
    .map(frontendRelativePath)
    .filter((path): path is string => path !== null)
    .filter((path) => !isGeneratedOrRegistryPath(path))
    .filter(hasLintableExtension)
    .filter((path) => {
      try {
        return (
          fileSystem.existsSync(path) && fileSystem.statSync(path).isFile()
        );
      } catch {
        return false;
      }
    });
}

function changedRepoFiles(baseRef: string, runner: CommandRunner) {
  const mergeBaseResult = runner.run("git", ["merge-base", baseRef, "HEAD"]);
  const diffBase =
    mergeBaseResult.status === SUCCESS_EXIT_CODE
      ? mergeBaseResult.stdout.trim()
      : baseRef;
  const diffResult = runner.run("git", [
    "diff",
    "--name-only",
    "--no-renames",
    `--diff-filter=${GIT_CHANGED_FILE_FILTER}`,
    diffBase,
    "HEAD",
    "--",
    FRONTEND_GIT_PATHSPEC,
  ]);

  if (diffResult.status !== SUCCESS_EXIT_CODE) {
    throw new Error(`Could not list changed frontend files from ${baseRef}.`);
  }

  const untrackedResult = runner.run("git", [
    "ls-files",
    "--others",
    "--exclude-standard",
    "--",
    FRONTEND_GIT_PATHSPEC,
  ]);
  const untrackedFiles =
    untrackedResult.status === SUCCESS_EXIT_CODE
      ? untrackedResult.stdout.split("\n").filter(Boolean)
      : [];

  return Array.from(
    new Set([
      ...diffResult.stdout.split("\n").filter(Boolean),
      ...untrackedFiles,
    ])
  );
}

function runChangedLint({
  environment = env,
  fileSystem = nodeFileSystem,
  runner = childProcessRunner,
}: {
  environment?: Record<string, string | undefined>;
  fileSystem?: FileSystemAccess;
  runner?: CommandRunner;
} = {}) {
  const baseRef = baseRefFromEnvironment(environment);
  const repoFiles = changedRepoFiles(baseRef, runner);
  if (requiresFullStaticAnalysis(repoFiles)) {
    console.log("Tooling policy changed; linting the full frontend.");
    const result = spawnSync("ultracite", ["check"], { stdio: "inherit" });
    return result.status ?? FAILURE_EXIT_CODE;
  }

  const files = lintableChangedFiles(repoFiles, fileSystem);

  if (files.length === 0) {
    console.log(`No changed frontend files to lint against ${baseRef}.`);
    return SUCCESS_EXIT_CODE;
  }

  console.log(`Linting ${files.length} changed frontend file(s).`);
  const result = spawnSync("ultracite", ["check", ...files], {
    stdio: "inherit",
  });
  return result.status ?? FAILURE_EXIT_CODE;
}

if (import.meta.main) {
  exit(runChangedLint());
}

export {
  baseRefFromEnvironment,
  changedRepoFiles,
  frontendRelativePath,
  lintableChangedFiles,
  requiresFullStaticAnalysis,
  requiresFullStaticAnalysisFromBase,
  runChangedLint,
};
