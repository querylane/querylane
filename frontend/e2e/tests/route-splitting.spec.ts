import { readdirSync, readFileSync } from "node:fs";
import path from "node:path";
import { z } from "zod";
import { expect, test } from "./base";

const scriptsDirectory = path.resolve(
  import.meta.dirname,
  "../../dist/static/js"
);
const sourceMapSchema = z.object({ sources: z.array(z.string()) });
const loaderRoutes = [
  "src/routes/instances/$instanceId/route.tsx",
  "src/routes/instances/$instanceId/databases/$databaseId/index.tsx",
  "src/routes/instances/$instanceId/databases/$databaseId/extensions.tsx",
  "src/routes/instances/$instanceId/databases/$databaseId/explorer.tsx",
];

test("build: route UI shares 1 lazy chunk without eager query dependencies", {
  tag: ["@feat:routing"],
}, () => {
  // Inspect emitted artifacts, not config text: the plugin and bundler must
  // actually preserve these boundaries in the production build used by E2E.
  const maps = readdirSync(scriptsDirectory, { recursive: true })
    .filter((entry): entry is string => typeof entry === "string")
    .filter((entry) => entry.endsWith(".js.map"))
    .map((entry) => ({
      entry,
      ...sourceMapSchema.parse(
        JSON.parse(readFileSync(path.join(scriptsDirectory, entry), "utf8"))
      ),
    }));
  expect(maps.length).toBeGreaterThan(0);

  for (const route of loaderRoutes) {
    const chunks = maps.filter(
      (map) =>
        map.entry.startsWith("async/") &&
        map.sources.some((source) => source.endsWith(route))
    );
    expect(
      chunks.map((chunk) => chunk.entry),
      route
    ).toHaveLength(1);
  }

  for (const dependency of [
    "src/lib/route-data-prefetch.ts",
    "src/components/database-layout.tsx",
    "src/features/data-explorer/explorer-table-detail.tsx",
  ]) {
    const chunks = maps.filter((map) =>
      map.sources.some((source) => source.endsWith(dependency))
    );
    expect(chunks.length, dependency).toBeGreaterThan(0);
    expect(
      chunks.every((chunk) => chunk.entry.startsWith("async/")),
      dependency
    ).toBe(true);
  }
});
