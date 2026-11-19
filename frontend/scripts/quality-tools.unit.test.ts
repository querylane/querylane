import { spawnSync } from "node:child_process";
import {
  mkdirSync,
  mkdtempSync,
  readFileSync,
  rmSync,
  writeFileSync,
} from "node:fs";
import { join, resolve } from "node:path";
import { describe, expect, test } from "@rstest/core";

const root = resolve(import.meta.dirname, "..");
const compilers = ["tsrs", "tsc"];

function lintBiome(file: string) {
  return spawnSync(
    join(root, "node_modules/.bin/biome"),
    ["lint", "--error-on-warnings", file],
    {
      cwd: root,
      encoding: "utf8",
    }
  );
}

test("default imports require a default export", () => {
  const directory = mkdtempSync(join(root, "scripts/quality-probe-"));
  const file = join(directory, "consumer.ts");
  const lint = () => lintBiome(file);
  try {
    writeFileSync(
      join(directory, "source.ts"),
      'export function read() { return "ready"; }\n'
    );
    writeFileSync(
      file,
      'import read from "./source"; export const value = read();\n'
    );
    const invalid = lint();
    expect(invalid.status).toBe(1);
    expect(invalid.stdout + invalid.stderr).toContain(
      "noUnresolvedDefaultImport"
    );
    writeFileSync(
      file,
      'import { read } from "./source"; export const value = read();\n'
    );
    const valid = lint();
    expect(valid.status, valid.stdout + valid.stderr).toBe(0);
  } finally {
    rmSync(directory, { recursive: true });
  }
});

test("rejects oversized authored files instead of passing a skipped scan", () => {
  const directory = mkdtempSync(join(root, "scripts/quality-probe-"));
  const file = join(directory, "oversized.ts");
  try {
    writeFileSync(join(directory, "valid.ts"), "export const ready = true;\n");
    writeFileSync(file, `//${" ".repeat(1_048_576)}\n`);
    const result = spawnSync(
      join(root, "node_modules/.bin/biome"),
      ["lint", "--error-on-warnings", directory],
      {
        cwd: root,
        encoding: "utf8",
      }
    );
    expect(result.status).toBe(1);
    expect(result.stdout + result.stderr).toContain(
      "exceeds the configured maximum"
    );
  } finally {
    rmSync(directory, { recursive: true });
  }
});

test("domain formatter and typed fixes converge without contradictory rewrites", () => {
  const directory = mkdtempSync(join(root, "src/lib/domain", "quality-probe-"));
  const file = join(directory, "probe.ts");
  const formatted =
    "export const count: (values: readonly string[]) => number = (values) =>\n  values.length;\n";
  try {
    writeFileSync(
      file,
      "export const count:(values:readonly string[])=>number=(values)=>values.length;\n"
    );
    const passes = Array.from({ length: 2 }, () => {
      const biome = spawnSync(
        join(root, "node_modules/.bin/biome"),
        ["check", "--write", file],
        { cwd: root, encoding: "utf8" }
      );
      const oxlint = spawnSync(
        join(root, "node_modules/.bin/oxlint"),
        [
          "--config",
          "oxlint.config.ts",
          "--type-aware",
          "--deny-warnings",
          "--fix",
          file,
        ],
        { cwd: root, encoding: "utf8" }
      );
      return {
        biome: biome.status,
        oxlint: oxlint.status,
        source: readFileSync(file, "utf8"),
      };
    });
    expect(passes).toEqual([
      { biome: 0, oxlint: 0, source: formatted },
      { biome: 0, oxlint: 0, source: formatted },
    ]);
  } finally {
    rmSync(directory, { recursive: true });
  }
});

test("tailwind shorthand fixes preserve vertical dividers", () => {
  const directory = mkdtempSync(join(root, "scripts", "quality-probe-"));
  const file = join(directory, "probe.tsx");
  const source = 'export const rows = <div className="divide-y" />;\n';
  try {
    writeFileSync(file, source);
    const result = spawnSync(
      join(root, "node_modules/.bin/biome"),
      ["lint", "--write", "--unsafe", file],
      { cwd: root, encoding: "utf8" }
    );
    expect(result.status, result.stdout + result.stderr).toBe(0);
    expect(readFileSync(file, "utf8")).toBe(source);
  } finally {
    rmSync(directory, { recursive: true });
  }
});

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
});
