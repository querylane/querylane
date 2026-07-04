import { readdirSync, readFileSync } from "node:fs";
import { join, relative } from "node:path";
import { cwd, exit } from "node:process";

const SUCCESS_EXIT_CODE = 0;
const FAILURE_EXIT_CODE = 1;
const EXTENSION_PATTERN = /\.[^.]+$/u;

const SCAN_DIRECTORIES = ["e2e", "scripts", "src", "test"];
const TEXT_EXTENSIONS = new Set([
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
const SUPPRESSION_PATTERNS = [
  ["biome", "ignore"].join("-"),
  ["c8", "ignore"].join(" "),
  ["eslint", "disable"].join("-"),
  ["istanbul", "ignore"].join(" "),
  ["oxlint", "disable"].join("-"),
  ["prettier", "ignore"].join("-"),
  ["stylelint", "disable"].join("-"),
  ["@ts", "expect", "error"].join("-"),
  ["@ts", "ignore"].join("-"),
  ["@ts", "nocheck"].join("-"),
  ["react", "doctor", "ignore"].join("-"),
  ["react", "doctor", "disable"].join("-"),
  ["type", "coverage", "ignore"].join("-"),
  ["no", "inspection"].join(""),
];
const ALLOWED_SUPPRESSION_PATH_PREFIXES = ["src/protogen/"];
const ALLOWED_SUPPRESSION_FILES = new Set<string>();

interface SuppressionViolation {
  line: number;
  path: string;
  pattern: string;
}

function hasTextExtension(path: string) {
  return TEXT_EXTENSIONS.has(path.match(EXTENSION_PATTERN)?.[0] ?? "");
}

function allowsSuppression(path: string) {
  return (
    ALLOWED_SUPPRESSION_FILES.has(path) ||
    ALLOWED_SUPPRESSION_PATH_PREFIXES.some((prefix) => path.startsWith(prefix))
  );
}

function listTextFiles(root: string, directories = SCAN_DIRECTORIES): string[] {
  const files: string[] = [];

  function walk(directory: string) {
    for (const entry of readdirSync(directory, { withFileTypes: true })) {
      const path = join(directory, entry.name);
      if (entry.isDirectory()) {
        walk(path);
        continue;
      }
      if (entry.isFile() && hasTextExtension(path)) {
        files.push(path);
      }
    }
  }

  for (const directory of directories) {
    walk(join(root, directory));
  }

  for (const entry of readdirSync(root, { withFileTypes: true })) {
    const path = join(root, entry.name);
    if (entry.isFile() && hasTextExtension(path)) {
      files.push(path);
    }
  }

  return files;
}

function findSuppressionViolations({
  files,
  projectRoot,
  readFile = readFileSync,
}: {
  files: readonly string[];
  projectRoot: string;
  readFile?: (path: string, encoding: BufferEncoding) => string;
}) {
  const violations: SuppressionViolation[] = [];

  for (const absolutePath of files) {
    const path = relative(projectRoot, absolutePath);
    if (allowsSuppression(path)) {
      continue;
    }

    const lines = readFile(absolutePath, "utf8").split("\n");
    for (const [index, line] of lines.entries()) {
      for (const pattern of SUPPRESSION_PATTERNS) {
        if (line.includes(pattern)) {
          violations.push({ line: index + 1, path, pattern });
        }
      }
    }
  }

  return violations;
}

function runSuppressionCheck(projectRoot = cwd()) {
  const violations = findSuppressionViolations({
    files: listTextFiles(projectRoot),
    projectRoot,
  });

  if (violations.length === 0) {
    console.log("No disallowed suppression comments found.");
    return SUCCESS_EXIT_CODE;
  }

  console.error("Disallowed suppression comments found:");
  for (const violation of violations) {
    console.error(
      `- ${violation.path}:${violation.line} contains ${violation.pattern}`
    );
  }
  return FAILURE_EXIT_CODE;
}

if (import.meta.main) {
  exit(runSuppressionCheck());
}

export { findSuppressionViolations, runSuppressionCheck };
