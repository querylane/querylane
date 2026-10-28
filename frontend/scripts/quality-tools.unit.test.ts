import { spawnSync } from "node:child_process";
import {
  mkdirSync,
  mkdtempSync,
  readFileSync,
  rmSync,
  symlinkSync,
  writeFileSync,
} from "node:fs";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import { describe, expect, test } from "@rstest/core";

const root = resolve(import.meta.dirname, "..");
const compilers = ["tsrs", "tsc"];
const DEBUGGER_RULE_PATTERN = /noDebugger|no-debugger/u;

test.each([
  { input: "", fixesEditedFile: false },
  { input: "not JSON", fixesEditedFile: false },
  { input: "{}", fixesEditedFile: false },
  { input: '{"tool_input":{}}', fixesEditedFile: false },
  { input: '{"tool_input":{"file_path":""}}', fixesEditedFile: false },
  {
    input: '{"tool_input":{"file_path":"edited.ts"}}',
    fixesEditedFile: true,
  },
])(
  "agent hook fixes only its named file: $input",
  ({ input, fixesEditedFile }) => {
    const directory = mkdtempSync(join(tmpdir(), "querylane-hook-"));
    const source = join(directory, "untouched.ts");
    const original = 'export const value={key:"value"};\n';
    try {
      symlinkSync(join(root, "node_modules"), join(directory, "node_modules"));
      writeFileSync(
        join(directory, "package.json"),
        JSON.stringify({ devDependencies: { "@biomejs/biome": "*" } })
      );
      writeFileSync(join(directory, "biome.json"), '{"root":true}');
      writeFileSync(source, original);
      const editedSource = join(directory, "edited.ts");
      writeFileSync(editedSource, original);
      const result = spawnSync(
        join(root, "node_modules/.bin/ultracite"),
        ["fix", "--hook"],
        { cwd: directory, encoding: "utf8", input }
      );
      expect(result.status).toBe(0);
      expect(readFileSync(source, "utf8")).toBe(original);
      expect(readFileSync(editedSource, "utf8")).toBe(
        fixesEditedFile ? 'export const value = { key: "value" };\n' : original
      );
    } finally {
      rmSync(directory, { recursive: true });
    }
  }
);

test("tailwind sorts cva variant objects using the project stylesheet", () => {
  const result = spawnSync(
    join(root, "node_modules/.bin/biome"),
    [
      "lint",
      "--config-path=biome.jsonc",
      "--write",
      "--unsafe",
      "--only=nursery/useTailwindSortedClasses",
      "--stdin-file-path=src/quality-probe.ts",
    ],
    {
      cwd: root,
      encoding: "utf8",
      input:
        'const variants = cva("", { variants: { size: { small: "px-2 flex" } } });\n',
    }
  );
  expect(result.status).toBe(0);
  expect(result.stdout).toContain('small: "flex px-2"');
});

test.each([
  { value: "0", status: 1 },
  { value: "MetricUnit.UNSPECIFIED", status: 0 },
])("typed lint checks protobuf enum values: $value", ({ value, status }) => {
  const directory = mkdtempSync(join(root, "src", "quality-probe-"));
  const source = join(directory, "probe.ts");
  try {
    writeFileSync(
      source,
      `import { MetricUnit } from "@/protogen/querylane/console/v1alpha1/metrics_pb";\n\nexport const unit: MetricUnit = ${value};\n`
    );
    const result = spawnSync(
      join(root, "node_modules/.bin/oxlint"),
      [
        "--config",
        "oxlint.config.ts",
        "--type-aware",
        "--deny-warnings",
        source,
      ],
      { cwd: root, encoding: "utf8" }
    );
    expect(result.status).toBe(status);
    expect(
      (result.stdout + result.stderr).includes("no-unsafe-enum-assignment")
    ).toBe(status === 1);
  } finally {
    rmSync(directory, { recursive: true });
  }
});

test.each(["biome", "oxlint"])(
  "%s rejects invalid source through the real CLI",
  (tool) => {
    const directory = mkdtempSync(join(root, "src", "quality-probe-"));
    const source = join(directory, "probe.ts");
    const args =
      tool === "biome"
        ? ["check", source]
        : ["--config", "oxlint.config.ts", "--deny-warnings", source];
    try {
      writeFileSync(source, "debugger;\n");
      const result = spawnSync(join(root, "node_modules/.bin", tool), args, {
        cwd: root,
        encoding: "utf8",
      });
      expect(result.status).toBe(1);
      expect(result.stdout + result.stderr).toMatch(DEBUGGER_RULE_PATTERN);
    } finally {
      rmSync(directory, { recursive: true });
    }
  }
);

function compileProbe(compiler: string, source: string) {
  const temporaryRoot = join(root, "node_modules", ".tmp");
  mkdirSync(temporaryRoot, { recursive: true });
  const directory = mkdtempSync(join(temporaryRoot, "quality-probe-"));
  const config = join(directory, "tsconfig.json");
  try {
    writeFileSync(
      config,
      JSON.stringify({
        extends: join(root, "tsconfig.strict.json"),
        compilerOptions: {
          noEmit: true,
          target: "ESNext",
          module: "ESNext",
          moduleResolution: "Bundler",
          types: ["react"],
        },
        files: [join(directory, "probe.ts"), join(root, "src/types/css.d.ts")],
      })
    );
    writeFileSync(join(directory, "probe.ts"), source);
    return spawnSync(
      join(root, "node_modules/.bin", compiler),
      ["-p", config, "--pretty", "false"],
      { cwd: root, encoding: "utf-8" }
    );
  } finally {
    rmSync(directory, { recursive: true });
  }
}

describe("strict compiler contracts", () => {
  test.each(compilers)(
    "%s permits custom CSS variables without opening arbitrary CSS properties",
    (compiler) => {
      const valid = compileProbe(
        compiler,
        'import type { CSSProperties } from "react"; export const style: CSSProperties = {"--querylane-probe": "1px", color: "red"};'
      );
      expect(valid.status).toBe(0);
      const invalid = compileProbe(
        compiler,
        'import type { CSSProperties } from "react"; export const style: CSSProperties = {querylaneInvalidProperty: "red"};'
      );
      expect(invalid.status).toBe(2);
      expect(invalid.stdout).toContain("TS2353");
    }
  );

  test.each(compilers)(
    "%s rejects unchecked indexing and explicit undefined in optional properties",
    (compiler) => {
      const result = compileProbe(
        compiler,
        "export const values: string[] = []; export const item: string = values[0]; export const options: {enabled?: boolean} = {enabled: undefined};"
      );
      expect(result.status).toBe(2);
      expect(result.stdout).toContain("TS2322");
      expect(result.stdout).toContain("TS2375");
    }
  );
});
