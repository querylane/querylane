import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, test } from "vitest";

const dataTablePath = resolve(
  import.meta.dirname,
  "../src/components/ui/data-table.tsx"
);
const IMPORT_PATTERN = /import\s*\{([\s\S]*?)\}\s*from\s*"([^"]+)";/g;
const TYPE_IMPORT_PREFIX = /^type\s+/;

function reactTableImportNames() {
  const source = readFileSync(dataTablePath, "utf8");
  const reactTableImport = [...source.matchAll(IMPORT_PATTERN)].find(
    ([, , moduleName]) => moduleName === "@tanstack/react-table"
  );

  if (!reactTableImport) {
    throw new Error("Expected a TanStack Table named import");
  }

  return (reactTableImport[1] ?? "")
    .split(",")
    .map((name) => name.trim().replace(TYPE_IMPORT_PREFIX, ""));
}

describe("data table TanStack imports", () => {
  test("imports only the filter and sort functions Querylane registers", () => {
    const importNames = reactTableImportNames();
    const importedFilterAndSortFns = importNames.filter(
      (name) => name.startsWith("filterFn_") || name.startsWith("sortFn_")
    );

    expect(importNames).not.toContain("filterFns");
    expect(importNames).not.toContain("sortFns");
    expect(importedFilterAndSortFns).toEqual([
      "filterFn_includesString",
      "sortFn_alphanumeric",
      "sortFn_basic",
      "sortFn_text",
    ]);
  });
});
