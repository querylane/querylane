import { spawnSync } from "node:child_process";
import { mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import { expect, test } from "@rstest/core";
import { z } from "zod";

const frontend = resolve(import.meta.dirname, "..");
const cases = [
  [
    "named",
    'import {useMemo as cached} from "react"; export const value = cached(() => 1, []);',
    1,
  ],
  [
    "namespace",
    'import * as R from "react"; export const value = R.useMemo(() => 1, []);',
    1,
  ],
  [
    "default",
    'import R from "react"; export const value = R.memo(() => null);',
    1,
  ],
  [
    "alias",
    'import R from "react"; const Alias = R; export const value = Alias["useCallback"](() => 1, []);',
    1,
  ],
  [
    "destructure",
    'import R from "react"; const {memo:cached} = R; export const value = cached(() => null);',
    1,
  ],
  [
    "dynamic",
    'const R = await import("react"); export const value = R.memo(() => null);',
    1,
  ],
  [
    "computed-dynamic",
    'import R from "react"; const key = "useMemo"; export const value = R[key](() => 1, []);',
    1,
  ],
  [
    "computed-destructure",
    'import R from "react"; const key = "memo"; const {[key]: cached} = R; export const value = cached(() => null);',
    1,
  ],
  [
    "normal",
    'import R from "react"; export const value = R.createContext(null);',
    0,
  ],
  [
    "shadow",
    'import R from "react"; export function value(R: {memo:() => number}) {return R.memo();}',
    0,
  ],
  [
    "type",
    'import type {memo} from "react"; export type Wrapped = typeof memo;',
    0,
  ],
  [
    "mock",
    'import * as actual from "react" with {rstest:"importActual"}; export const value = {...actual};',
    0,
  ],
] as const;

test.each(cases)("memoization policy: %s", (_name, source, expected) => {
  const root = mkdtempSync(join(tmpdir(), "querylane-memo-policy-"));
  try {
    const config = join(root, "oxlint.json");
    writeFileSync(
      config,
      JSON.stringify({
        plugins: [],
        categories: {
          correctness: "off",
          suspicious: "off",
          perf: "off",
          style: "off",
          pedantic: "off",
          restriction: "off",
          nursery: "off",
        },
        jsPlugins: [
          {
            name: "querylane",
            specifier: join(frontend, "scripts/querylane-lint.config.ts"),
          },
        ],
        rules: { "querylane/no-manual-memoization": "error" },
      })
    );
    const file = join(root, "probe.tsx");
    writeFileSync(file, source);
    const result = spawnSync(
      join(frontend, "node_modules/.bin/oxlint"),
      ["--config", config, "--format", "json", file],
      { cwd: frontend, encoding: "utf8" }
    );
    expect(result.status, result.stdout + result.stderr).toBe(expected);
    const report = z
      .object({ diagnostics: z.array(z.object({ code: z.string() })) })
      .parse(JSON.parse(result.stdout));
    expect(
      report.diagnostics.some((diagnostic) =>
        diagnostic.code.includes("no-manual-memoization")
      )
    ).toBe(expected === 1);
  } finally {
    rmSync(root, { recursive: true });
  }
});
