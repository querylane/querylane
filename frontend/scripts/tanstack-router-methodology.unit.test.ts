import { globSync, readFileSync } from "node:fs";
import { relative, resolve } from "node:path";
import { describe, expect, test } from "vitest";

const ROUTER_MODULE = "@tanstack/react-router";
const ROUTER_IMPORT_ALIAS_PATTERN = /\s+as\s+/;
const ROUTER_TYPE_IMPORT_PATTERN = /^type\s+/;
const SCOPED_HOOKS = new Set([
  "useLoaderData",
  "useNavigate",
  "useParams",
  "useRouteContext",
  "useSearch",
]);
const TEST_SOURCE_PATTERN = /\.(browser|integration|test|unit)\.tsx?$/;
const UNCHECKED_ROUTER_HOOK_PATTERN = /strict\s*:\s*false/g;
const projectRoot = resolve(import.meta.dirname, "..");

function productionSourcePaths(): string[] {
  return globSync("src/**/*.{ts,tsx}", { cwd: projectRoot })
    .filter(
      (path) =>
        !(
          path.includes("/protogen/") ||
          path.endsWith("routeTree.gen.ts") ||
          TEST_SOURCE_PATTERN.test(path)
        )
    )
    .map((path) => resolve(projectRoot, path));
}

function importedRouterHooks(source: string): Set<string> {
  const hooks = new Set<string>();
  const importPattern = new RegExp(
    `import\\s*\\{([^}]*)\\}\\s*from\\s*["']${ROUTER_MODULE}["']`,
    "g"
  );
  for (const match of source.matchAll(importPattern)) {
    for (const specifier of (match[1] ?? "").split(",")) {
      const [importedName, localName] = specifier
        .trim()
        .replace(ROUTER_TYPE_IMPORT_PATTERN, "")
        .split(ROUTER_IMPORT_ALIAS_PATTERN);
      if (importedName && SCOPED_HOOKS.has(importedName)) {
        hooks.add(localName ?? importedName);
      }
    }
  }
  return hooks;
}

function uncheckedRouterHooks(path: string): string[] {
  const source = readFileSync(path, "utf8");
  return Array.from(source.matchAll(UNCHECKED_ROUTER_HOOK_PATTERN), (match) => {
    const line = source.slice(0, match.index).split("\n").length;
    return `${relative(projectRoot, path)}:${line} must not use strict: false`;
  });
}

function unscopedRouterHooks(path: string): string[] {
  const source = readFileSync(path, "utf8");
  const hooks = importedRouterHooks(source);
  const violations: string[] = [];
  for (const hook of hooks) {
    const callPattern = new RegExp(
      `(?<![\\w.])${hook}\\s*\\(\\s*(?!\\{\\s*from(?:\\s*:|\\s*[,}]))`,
      "g"
    );
    for (const match of source.matchAll(callPattern)) {
      const line = source.slice(0, match.index).split("\n").length;
      violations.push(
        `${relative(projectRoot, path)}:${line} ${hook} needs { from }`
      );
    }
  }
  return violations;
}

describe("TanStack Router methodology", () => {
  test("scopes every production Router hook to its owning route", () => {
    const violations = productionSourcePaths().flatMap(unscopedRouterHooks);
    expect(violations).toEqual([]);
  });

  test("does not opt out of Router hook type safety", () => {
    const violations = productionSourcePaths().flatMap(uncheckedRouterHooks);
    expect(violations).toEqual([]);
  });
});
