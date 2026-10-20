import { spawnSync } from "node:child_process";
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { join, resolve } from "node:path";
import { describe, expect, test } from "@rstest/core";

const root = resolve(import.meta.dirname, "..");
const compilers = ["tsrs", "tsc"];
const DEBUGGER_RULE_PATTERN = /noDebugger|no-debugger/u;

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
