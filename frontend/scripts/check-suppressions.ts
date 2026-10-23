import { type Dirent, readdirSync, readFileSync } from "node:fs";
import { basename, dirname, join, relative } from "node:path";
import { cwd, exit } from "node:process";

const SUCCESS_EXIT_CODE = 0;
const FAILURE_EXIT_CODE = 1;
const EXTENSION_PATTERN = /\.[^.]+$/u;

const ARTIFACT_DIRECTORIES = new Set([
  ".git",
  ".cache",
  ".next",
  ".nyc_output",
  ".turbo",
  "build",
  "coverage",
  "dist",
  "node_modules",
  "opensrc",
  "out",
  "playwright-report",
  "test-results",
]);
const TEXT_EXTENSIONS = new Set([
  ".cjs",
  ".css",
  ".cts",
  ".html",
  ".js",
  ".json",
  ".jsonc",
  ".jsx",
  ".mjs",
  ".mts",
  ".mdx",
  ".svg",
  ".ts",
  ".tsx",
]);
const SUPPRESSION_PATTERNS = [
  ["biome", "ignore"].join("-"),
  ["c8", "ignore"].join(" "),
  ["eslint", "disable"].join("-"),
  ["istanbul", "ignore"].join(" "),
  ["oxlint", "disable"].join("-"),
  ["oxlint", "ignore"].join("-"),
  ["v8", "ignore"].join(" "),
  ["use no", "memo"].join(" "),
  ["use no", "forget"].join(" "),
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
const SUPPRESSION_MATCHERS = SUPPRESSION_PATTERNS.map((pattern) => ({
  pattern,
  matcher: new RegExp(String.raw`(?:<!--|(?<![\w-]))${pattern}(?!\w)`, "u"),
}));
const ALLOWED_SUPPRESSION_PATH_PREFIXES = ["src/protogen/"];
const ALLOWED_SUPPRESSION_FILES = new Set<string>();
const GENERATED_FILE_PATTERN = /\.(?:gen|generated|auto)\./u;
const GENERATED_HEADER_PATTERN =
  /@generated\b|DO NOT EDIT|auto-generated|automatically generated/iu;
const GENERATED_HEADER_LINES = 5;
const QUALITY_IGNORE_NAMES = new Set([
  ".oxlintignore",
  ".biomeignore",
  ".eslintignore",
  ".prettierignore",
]);
const TOOL_CONFIG_NAMES = new Set([
  "biome.json",
  "biome.jsonc",
  ".oxlintrc.json",
  ".oxlintrc.jsonc",
  "oxlint.config.ts",
  "oxlint.config.mts",
  ".oxlintignore",
  ".biomeignore",
  "doctor.config.ts",
  "react-doctor.config.json",
  "tsconfig.json",
]);

interface SuppressionViolation {
  line: number;
  path: string;
  pattern: string;
}

function hasTextExtension(path: string) {
  return TEXT_EXTENSIONS.has(EXTENSION_PATTERN.exec(path)?.[0] ?? "");
}

function allowsSuppression(path: string) {
  return (
    ALLOWED_SUPPRESSION_FILES.has(path) ||
    ALLOWED_SUPPRESSION_PATH_PREFIXES.some((prefix) => path.startsWith(prefix))
  );
}

function listTextFiles(root: string) {
  const files: string[] = [];
  const symbolicLinks: string[] = [];

  const reservedDirectories: string[] = [];
  function visit(entry: Dirent, directory: string) {
    const path = join(directory, entry.name);
    if (entry.isDirectory()) {
      visitDirectory(path, directory, entry.name);
    } else if (entry.isSymbolicLink()) {
      symbolicLinks.push(path);
    } else if (
      entry.isFile() &&
      (hasTextExtension(path) || QUALITY_IGNORE_NAMES.has(entry.name))
    ) {
      files.push(path);
    }
  }
  function visitDirectory(path: string, parent: string, name: string) {
    if (ARTIFACT_DIRECTORIES.has(name)) {
      if (parent !== root) {
        reservedDirectories.push(path);
      }
      return;
    }
    walk(path);
  }
  function walk(directory: string) {
    for (const entry of readdirSync(directory, { withFileTypes: true })) {
      visit(entry, directory);
    }
  }

  walk(root);

  return { files, reservedDirectories, symbolicLinks };
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
    violations.push(
      ...findCoverageViolations(path),
      ...findFileSuppressionViolations({ absolutePath, path, readFile })
    );
  }

  return violations;
}

function findCoverageViolations(path: string): SuppressionViolation[] {
  const violations: SuppressionViolation[] = [];
  if (GENERATED_FILE_PATTERN.test(path) && path !== "src/routeTree.gen.ts") {
    violations.push({
      path,
      line: 1,
      pattern: "generated filename outside generated source",
    });
  }
  if (QUALITY_IGNORE_NAMES.has(basename(path))) {
    violations.push({ path, line: 1, pattern: "quality ignore file" });
  }
  if (TOOL_CONFIG_NAMES.has(basename(path)) && dirname(path) !== ".") {
    violations.push({
      path,
      line: 1,
      pattern: "nested quality configuration",
    });
  }
  return violations;
}

function findFileSuppressionViolations({
  absolutePath,
  path,
  readFile,
}: {
  absolutePath: string;
  path: string;
  readFile: (path: string, encoding: BufferEncoding) => string;
}): SuppressionViolation[] {
  const violations: SuppressionViolation[] = [];
  const lines = readFile(absolutePath, "utf8").split("\n");
  if (
    path !== "src/routeTree.gen.ts" &&
    lines
      .slice(0, GENERATED_HEADER_LINES)
      .some((line) => GENERATED_HEADER_PATTERN.test(line))
  ) {
    violations.push({
      line: 1,
      path,
      pattern: "generated header outside generated source",
    });
  }
  for (const [index, line] of lines.entries()) {
    for (const { pattern, matcher } of SUPPRESSION_MATCHERS) {
      if (matcher.test(line)) {
        violations.push({ line: index + 1, path, pattern });
      }
    }
  }
  return violations;
}

function runSuppressionCheck(projectRoot = cwd()) {
  const { files, reservedDirectories, symbolicLinks } =
    listTextFiles(projectRoot);
  const violations = [
    ...findSuppressionViolations({ files, projectRoot }),
    ...reservedDirectories.map((path) => ({
      path: relative(projectRoot, path),
      line: 1,
      pattern: "reserved artifact directory nested in source",
    })),
    ...symbolicLinks.map((path) => ({
      path: relative(projectRoot, path),
      line: 1,
      pattern: "symbolic link outside dependency artifacts",
    })),
  ];

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
