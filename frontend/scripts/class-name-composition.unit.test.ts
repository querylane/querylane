import { globSync, readFileSync, statSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, test } from "vitest";

const sourceRoot = resolve(import.meta.dirname, "../src");
const PROTOGEN_PATH_PATTERN = /(^|\/)protogen\//u;
const STRING_COMPOSITION_PATTERNS = [
  /className\s*=\s*\{`[^`]*\$\{/gu,
  /className\s*=\s*\{\s*\[[\s\S]*?\]\s*\.filter\(Boolean\)\s*\.join\(["'] ["']\)/gu,
  /className\s*=\s*\{cn\((?:(?!\)\s*\})[\s\S])*?`[^`]*\$\{/gu,
];

function findClassNameCompositionViolations() {
  const violations: string[] = [];

  for (const path of globSync("**/*.tsx", { cwd: sourceRoot })) {
    const absolutePath = resolve(sourceRoot, path);

    if (
      !statSync(absolutePath).isFile() ||
      PROTOGEN_PATH_PATTERN.test(path) ||
      path.endsWith(".gen.tsx")
    ) {
      continue;
    }

    const source = readFileSync(absolutePath, "utf8");

    for (const pattern of STRING_COMPOSITION_PATTERNS) {
      for (const match of source.matchAll(pattern)) {
        const line = source.slice(0, match.index).split("\n").length;
        violations.push(`${path}:${line}`);
      }
    }
  }

  return violations.sort();
}

describe("className composition", () => {
  test("uses cn instead of string composition", () => {
    expect(findClassNameCompositionViolations()).toEqual([]);
  });
});
