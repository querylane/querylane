import { spawnSync } from "node:child_process";
import {
  mkdirSync,
  mkdtempSync,
  rmSync,
  symlinkSync,
  writeFileSync,
} from "node:fs";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import { expect, test } from "@rstest/core";
import { z } from "zod";

const frontend = resolve(import.meta.dirname, "..");
const interpolationStart = "${";
const examples = [
  {
    rule: "react(exhaustive-effect-dependencies)",
    invalid:
      'import { useEffect, useRef } from "react";\n\nexport function useTitleAndFocus(title: string): void { const ref = useRef<HTMLInputElement>(null); useEffect(function syncTitle() { document.title = title; ref.current?.focus(); }, []); }',
    valid:
      'import { useEffect, useRef } from "react";\n\nexport function useTitleAndFocus(title: string): void { const ref = useRef<HTMLInputElement>(null); useEffect(function syncTitle() { document.title = title; ref.current?.focus(); }, [title]); }',
  },
  {
    rule: "unicorn(no-array-callback-reference)",
    invalid: 'export const values = ["1", "2"].map(Number.parseInt);',
    valid:
      'export const values = ["1", "2"].map((value) => Number.parseInt(value, 10));',
  },
  {
    rule: "typescript(no-floating-promises)",
    invalid:
      'export function run(): void { void Promise.reject(new Error("Failure")); }',
    valid:
      'export function run(): Promise<void> { return Promise.reject(new Error("Failure")); }',
  },
  {
    rule: "typescript(restrict-template-expressions)",
    invalid: `export function title(value: string | undefined): string { return \`name:${interpolationStart}value}\`; }`,
    valid: `export function title(value: string | undefined): string { return \`name:${interpolationStart}value ?? ""}\`; }`,
  },
  {
    rule: "typescript(only-throw-error)",
    invalid: "export function fail(value: unknown): never { throw value; }",
    valid:
      'export function fail(value: unknown): never { throw new Error("Failure", { cause: value }); }',
  },
  {
    rule: "typescript(consistent-return)",
    invalid:
      'export function title(flag: boolean): string | undefined { if (flag) { return "yes"; } return; }',
    valid:
      'export function title(flag: boolean): string | undefined { if (flag) { return "yes"; } return undefined; }',
  },
  {
    rule: "promise(always-return)",
    invalid:
      "export function finish(task: Promise<void>, mark: () => void): Promise<void> { return task.then(() => { mark(); }); }",
    valid:
      "export function finish(task: Promise<void>, mark: () => void): Promise<void> { return task.then(() => { mark(); return undefined; }); }",
  },
  {
    rule: "typescript(require-await)",
    invalid:
      'export async function result(): Promise<string> { return "ready"; }',
    valid:
      'export function result(): Promise<string> { return Promise.resolve("ready"); }',
  },
  {
    rule: "react(jsx-key)",
    suffix: "tsx",
    invalid: 'export const rows = [<span key="same" />, <span key="same" />];',
    valid: 'export const rows = [<span key="first" />, <span key="second" />];',
  },
  {
    rule: "jest(no-commented-out-tests)",
    suffix: "unit.test.ts",
    invalid: '// test("hidden", () => {});\nexport const ready = true;',
    valid:
      "// Active tests are not hidden in comments.\nexport const ready = true;",
  },
];

test.each(examples)(
  "enforces $rule through the actual typed lint configuration",
  (example) => {
    const directory = mkdtempSync(join(tmpdir(), "querylane-rule-contracts-"));
    const file = join(
      directory,
      "scripts",
      `contract.${example.suffix ?? "ts"}`
    );
    const lint = (source: string) => {
      writeFileSync(file, `${source}\n`);
      return spawnSync(
        join(frontend, "node_modules/.bin/oxlint"),
        [
          "--config",
          join(frontend, "oxlint.config.ts"),
          "--type-aware",
          "--deny-warnings",
          "--disable-nested-config",
          "--format",
          "json",
          file,
        ],
        { cwd: directory, encoding: "utf8" }
      );
    };
    try {
      mkdirSync(join(directory, "scripts"));
      symlinkSync(
        join(frontend, "node_modules"),
        join(directory, "node_modules"),
        "dir"
      );
      // Keep the real compiler options and lint policy, but not other workers'
      // deliberately invalid/disappearing probe files in the shared program.
      writeFileSync(
        join(directory, "tsconfig.json"),
        JSON.stringify({
          extends: join(frontend, "tsconfig.json"),
          files: [file],
          include: [],
          references: [],
        })
      );
      const invalid = lint(example.invalid);
      expect(invalid.status, invalid.stdout + invalid.stderr).toBe(1);
      const report = z
        .object({ diagnostics: z.array(z.object({ code: z.string() })) })
        .parse(JSON.parse(invalid.stdout));
      expect(
        report.diagnostics.map((diagnostic) => diagnostic.code),
        invalid.stdout + invalid.stderr
      ).toContain(example.rule);
      const valid = lint(example.valid);
      expect(valid.status, valid.stdout + valid.stderr).toBe(0);
    } finally {
      rmSync(directory, { recursive: true });
    }
  }
);
