import { spawnSync } from "node:child_process";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { exit } from "node:process";

const SUCCESS_EXIT_CODE = 0;
const FAILURE_EXIT_CODE = 1;
const SHADCN_COMMAND = "bun";
const SHADCN_BINARY_PATH = "node_modules/.bin/shadcn";
const PACKAGE_JSON_PATH = resolve("package.json");
const SHADCN_PACKAGE_NAME = "shadcn";
const ANSI_ESCAPE_CHARACTER_CODE = 27;
const EXACT_VERSION_PATTERN = /^\d+\.\d+\.\d+(?:-[0-9A-Za-z.-]+)?$/u;
const ANSI_ESCAPE_PATTERN = new RegExp(
  `${String.fromCharCode(ANSI_ESCAPE_CHARACTER_CODE)}(?:[@-Z\\\\-_]|\\[[0-?]*[ -/]*[@-~])`,
  "gu"
);
const JSON_OBJECT_LINE_PATTERN = /(^|\n)\s*\{/u;
const OVERWRITE_PATTERN = /^\s*(?:[│┃|]\s*)?~\s+(?<path>\S+)\s+overwrite\b/u;
const FILES_SUMMARY_PATTERN =
  /^\s*(?:[├+|]\s*)?Files\s*\(\d+\)(?<summary>[^\n]*)$/mu;
const OVERWRITE_SUMMARY_PATTERN = /~(?<count>\d+)\s+overwrite\b/u;
const NO_CHANGES_PATTERN = /\bNo changes\./u;
// These are deliberate strict TypeScript compatibility patches against
// shadcn 4.11.0 output: calendar keeps safer DayPicker modifier access and
// sonner sanitizes the next-themes value before passing it to Sonner.
const ALLOWED_STRICT_TYPESCRIPT_DRIFT_FILES = new Set([
  "src/components/ui/calendar.tsx",
  "src/components/ui/sonner.tsx",
]);

interface CommandResult {
  status: number | null;
  stderr: string;
  stdout: string;
}

interface CommandRunner {
  run: (command: string, args: readonly string[]) => CommandResult;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function readPinnedShadcnPackageSpecifier() {
  const packageJson: unknown = JSON.parse(
    readFileSync(PACKAGE_JSON_PATH, "utf8")
  );
  if (!isRecord(packageJson)) {
    throw new Error("package.json did not parse to an object.");
  }

  const dependencies = isRecord(packageJson["dependencies"])
    ? packageJson["dependencies"]
    : {};
  const devDependencies = isRecord(packageJson["devDependencies"])
    ? packageJson["devDependencies"]
    : {};
  const version =
    devDependencies[SHADCN_PACKAGE_NAME] ?? dependencies[SHADCN_PACKAGE_NAME];

  if (typeof version !== "string") {
    throw new Error("package.json does not declare a shadcn dependency.");
  }
  if (!EXACT_VERSION_PATTERN.test(version)) {
    throw new Error(
      `shadcn must be pinned to an exact version in package.json, got ${version}.`
    );
  }

  return `${SHADCN_PACKAGE_NAME}@${version}`;
}

const childProcessRunner: CommandRunner = {
  run: (command, args) => {
    const result = spawnSync(command, [...args], {
      encoding: "utf8",
      stdio: ["ignore", "pipe", "pipe"],
    });

    return {
      status: result.status,
      stderr: result.stderr,
      stdout: result.stdout,
    };
  },
};

function commandOutput(result: CommandResult) {
  return [result.stdout, result.stderr].filter(Boolean).join("\n");
}

function shadcnBaseArgs() {
  return [SHADCN_BINARY_PATH] as const;
}

function runRequiredCommand(
  runner: CommandRunner,
  command: string,
  args: readonly string[],
  label: string
) {
  const result = runner.run(command, args);
  if (result.status !== SUCCESS_EXIT_CODE) {
    throw new Error(`${label} failed.\n${commandOutput(result)}`.trim());
  }
  return result;
}

function stripAnsi(output: string) {
  return output.replace(ANSI_ESCAPE_PATTERN, "");
}

function parseShadcnInfoComponents(output: string) {
  const sanitizedOutput = stripAnsi(output);
  const jsonLineMatch = JSON_OBJECT_LINE_PATTERN.exec(sanitizedOutput);
  const jsonStart =
    typeof jsonLineMatch?.index === "number"
      ? sanitizedOutput.indexOf("{", jsonLineMatch.index)
      : -1;
  const jsonEnd = sanitizedOutput.lastIndexOf("}");
  if (jsonStart === -1 || jsonEnd === -1 || jsonEnd < jsonStart) {
    throw new Error("shadcn info did not return JSON output.");
  }

  const info = JSON.parse(sanitizedOutput.slice(jsonStart, jsonEnd + 1)) as {
    components?: unknown;
  };

  if (!Array.isArray(info.components)) {
    throw new Error("shadcn info JSON did not include components[].");
  }

  return info.components.filter(
    (component): component is string => typeof component === "string"
  );
}

function normalizeShadcnComponents(components: string[]) {
  return Array.from(new Set(components)).sort((left, right) =>
    left.localeCompare(right)
  );
}

function findShadcnOverwriteFiles(output: string) {
  return stripAnsi(output)
    .split("\n")
    .map((line) => line.match(OVERWRITE_PATTERN)?.groups?.["path"])
    .filter((path): path is string => Boolean(path));
}

function findExpectedShadcnOverwriteCount(output: string) {
  const filesSummary = stripAnsi(output).match(FILES_SUMMARY_PATTERN);
  if (!filesSummary) {
    return null;
  }

  const summary = filesSummary.groups?.["summary"] ?? "";
  const overwriteCount = summary.match(OVERWRITE_SUMMARY_PATTERN)?.groups?.[
    "count"
  ];
  return overwriteCount ? Number.parseInt(overwriteCount, 10) : 0;
}

function isNoChangeShadcnDiff(output: string) {
  return NO_CHANGES_PATTERN.test(stripAnsi(output));
}

function confirmBlockingOverwriteFiles({
  baseArgs,
  blockingOverwriteFiles,
  components,
  runner,
}: {
  baseArgs: readonly string[];
  blockingOverwriteFiles: string[];
  components: string[];
  runner: CommandRunner;
}) {
  const confirmedBlockingOverwriteFiles: string[] = [];

  for (const file of blockingOverwriteFiles) {
    const diffResult = runRequiredCommand(
      runner,
      SHADCN_COMMAND,
      [...baseArgs, "add", ...components, "--diff", file],
      `shadcn registry diff for ${file}`
    );
    const diffOutput = commandOutput(diffResult);
    console.log(diffOutput);

    if (!isNoChangeShadcnDiff(diffOutput)) {
      confirmedBlockingOverwriteFiles.push(file);
    }
  }

  return confirmedBlockingOverwriteFiles;
}

function runShadcnRegistrySyncCheck({
  runner = childProcessRunner,
}: {
  runner?: CommandRunner;
} = {}) {
  const shadcnPackageSpecifier = readPinnedShadcnPackageSpecifier();
  const baseArgs = shadcnBaseArgs();
  console.log(
    `Validating shadcn registry sync with ${shadcnPackageSpecifier}.`
  );
  const infoResult = runRequiredCommand(
    runner,
    SHADCN_COMMAND,
    [...baseArgs, "info", "--json"],
    "shadcn info"
  );
  const components = normalizeShadcnComponents(
    parseShadcnInfoComponents(infoResult.stdout)
  );

  if (components.length === 0) {
    console.error(
      "shadcn info returned zero components. This repo has vendored shadcn UI files, so the registry sync guard is misconfigured."
    );
    return FAILURE_EXIT_CODE;
  }

  const dryRunResult = runRequiredCommand(
    runner,
    SHADCN_COMMAND,
    [...baseArgs, "add", ...components, "--dry-run"],
    "shadcn registry dry run"
  );
  const dryRunOutput = commandOutput(dryRunResult);
  console.log(dryRunOutput);

  const overwriteFiles = findShadcnOverwriteFiles(dryRunOutput);
  const expectedOverwriteCount = findExpectedShadcnOverwriteCount(dryRunOutput);
  if (expectedOverwriteCount === null) {
    throw new Error(
      "shadcn dry-run output did not include a Files summary. Refusing to pass a blind registry sync check."
    );
  }
  if (overwriteFiles.length !== expectedOverwriteCount) {
    throw new Error(
      `Parsed ${overwriteFiles.length} overwrite file(s), but shadcn reported ${expectedOverwriteCount}. Update the registry sync parser.`
    );
  }

  const blockingOverwriteFiles = overwriteFiles.filter(
    (file) => !ALLOWED_STRICT_TYPESCRIPT_DRIFT_FILES.has(file)
  );
  const allowedOverwriteFiles = overwriteFiles.filter((file) =>
    ALLOWED_STRICT_TYPESCRIPT_DRIFT_FILES.has(file)
  );

  if (allowedOverwriteFiles.length > 0) {
    console.log("Allowed strict TypeScript compatibility patches:");
    for (const file of allowedOverwriteFiles) {
      console.log(`- ${file}`);
    }
  }

  const confirmedBlockingOverwriteFiles = confirmBlockingOverwriteFiles({
    baseArgs,
    blockingOverwriteFiles,
    components,
    runner,
  });

  if (confirmedBlockingOverwriteFiles.length === 0) {
    console.log("shadcn registry sync check passed.");
    return SUCCESS_EXIT_CODE;
  }

  console.error("shadcn registry drift detected in vendored UI files:");
  for (const file of confirmedBlockingOverwriteFiles) {
    console.error(`- ${file}`);
  }
  console.error("");
  console.error(
    "Keep src/components/ui as native shadcn output. Move Querylane-specific wrappers outside ui, then refresh with shadcn add."
  );

  return FAILURE_EXIT_CODE;
}

if (import.meta.main) {
  try {
    exit(runShadcnRegistrySyncCheck());
  } catch (error) {
    console.error(error instanceof Error ? error.message : String(error));
    exit(FAILURE_EXIT_CODE);
  }
}

export {
  confirmBlockingOverwriteFiles,
  findExpectedShadcnOverwriteCount,
  findShadcnOverwriteFiles,
  isNoChangeShadcnDiff,
  normalizeShadcnComponents,
  parseShadcnInfoComponents,
  readPinnedShadcnPackageSpecifier,
  runShadcnRegistrySyncCheck,
};
