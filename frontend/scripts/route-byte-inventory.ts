import { createHash } from "node:crypto";
import { readdirSync, readFileSync, realpathSync } from "node:fs";
import { isAbsolute, join, relative, resolve } from "node:path";
import { gzipSync } from "node:zlib";
import { z } from "zod";
import { routeComponentPath } from "./route-component-path";

const PATH_SEPARATOR = /[\\/]/u;
const SHA = z.string().regex(/^[a-f0-9]{64}$/u);
const REVISION = z.string().regex(/^[a-f0-9]{40}$/u);
const PATH = z
  .string()
  .min(1)
  .refine(
    (path) =>
      !(
        isAbsolute(path) ||
        path.split(PATH_SEPARATOR).includes("..") ||
        path.includes("\\")
      ),
    "Expected a relative contained asset path"
  );
const STRINGS = z.array(z.string().min(1));
const metadataSchema = z.strictObject({
  revision: REVISION,
  dirty: z.boolean(),
  sourceHash: SHA,
  configHash: SHA,
  lockHash: SHA,
  toolchain: z.string().min(1),
  graphHash: SHA,
  buildEnvironmentHash: SHA,
});
const routeSchema = z.strictObject({
  id: z.string().startsWith("/"),
  source: PATH,
  directAssets: z.array(PATH).nonempty(),
  reachableAssets: z.array(PATH).nonempty(),
});
const graphSchema = z.object({
  data: z.object({
    hash: z.string().min(1),
    root: z.string().min(1),
    chunkGraph: z.object({
      assets: z.array(z.object({ path: PATH })).nonempty(),
      chunks: z
        .array(
          z.object({
            id: z.string().min(1),
            initial: z.boolean(),
            assets: STRINGS,
            modules: z.array(z.number().int()),
            dependencies: STRINGS,
          })
        )
        .nonempty(),
    }),
    moduleGraph: z.object({
      modules: z
        .array(
          z.object({
            id: z.number().int(),
            path: z.string().min(1),
            modules: z.array(z.number().int()).optional(),
          })
        )
        .nonempty(),
    }),
  }),
});
const inventorySchema = z.strictObject({
  schemaVersion: z.literal(1),
  metric: z.literal("node-gzip-default-js-css-html-v1"),
  metadata: metadataSchema,
  graph: graphSchema.shape.data,
  entryHtml: z.string().min(1),
  buildHash: z.string().min(1),
  assets: z
    .array(
      z.strictObject({
        path: PATH,
        raw: z.number().int().positive(),
        gzip: z.number().int().positive(),
        sha256: SHA,
      })
    )
    .nonempty(),
  initialAssets: z.array(PATH).nonempty(),
  routes: z.array(routeSchema).nonempty(),
});
type RouteInventory = z.infer<typeof inventorySchema>;
type RouteMetadata = z.infer<typeof metadataSchema>;
interface RouteDefinition {
  id: string;
  source: string;
}

function sha256(value: string | Buffer) {
  return createHash("sha256").update(value).digest("hex");
}

function unique(values: readonly unknown[], label: string) {
  if (new Set(values).size !== values.length) {
    throw new Error(`Duplicate ${label}`);
  }
}

const CODE_ASSET = /\.(?:js|css)$/u;
function emittedFiles(directory: string, prefix = ""): string[] {
  return readdirSync(directory, { withFileTypes: true }).flatMap((entry) => {
    const path = prefix ? `${prefix}/${entry.name}` : entry.name;
    if (entry.isDirectory()) {
      return emittedFiles(join(directory, entry.name), path);
    }
    return CODE_ASSET.test(path) ? [path] : [];
  });
}
function containedFile(directory: string, path: string) {
  const base = realpathSync(directory);
  const actual = realpathSync(resolve(base, PATH.parse(path)));
  const child = relative(base, actual);
  if (isAbsolute(child) || child.startsWith("..")) {
    throw new Error(`Asset escapes output directory: ${path}`);
  }
  return readFileSync(actual);
}

type BuildGraph = z.infer<typeof graphSchema>["data"];
function validateChunkReferences(
  chunk: BuildGraph["chunkGraph"]["chunks"][number],
  graph: BuildGraph
) {
  for (const id of chunk.dependencies) {
    if (!graph.chunkGraph.chunks.some((item) => item.id === id)) {
      throw new Error(`Missing dependency chunk ${id}`);
    }
  }
  for (const id of chunk.modules) {
    if (!graph.moduleGraph.modules.some((item) => item.id === id)) {
      throw new Error(`Missing emitted module ${id}`);
    }
  }
  for (const path of chunk.assets) {
    if (!graph.chunkGraph.assets.some((item) => item.path === path)) {
      throw new Error(`Missing graph asset ${path}`);
    }
  }
}
function validateGraphReferences(graph: BuildGraph) {
  const { chunks, assets: graphAssets } = graph.chunkGraph;
  unique(
    chunks.map((chunk) => chunk.id),
    "chunk IDs"
  );
  unique(
    graphAssets.map((asset) => asset.path),
    "asset paths"
  );
  unique(
    graph.moduleGraph.modules.map((module) => module.id),
    "module IDs"
  );
  if (
    !graph.chunkGraph.chunks.some(
      (chunk) =>
        chunk.initial && chunk.assets.some((path) => CODE_ASSET.test(path))
    )
  ) {
    throw new Error("Missing initial chunk asset inventory");
  }
  for (const chunk of graph.chunkGraph.chunks) {
    validateChunkReferences(chunk, graph);
  }
  for (const asset of graph.chunkGraph.assets) {
    if (!CODE_ASSET.test(asset.path)) {
      continue;
    }
    if (
      !graph.chunkGraph.chunks.some((chunk) =>
        chunk.assets.includes(asset.path)
      )
    ) {
      throw new Error(`Missing asset chunk ownership: ${asset.path}`);
    }
  }
}

const HTML_REFERENCE =
  /<(?:script|link)\b[^>]+(?:src|href)="(?<asset>[^"]+)"/gu;
function htmlEntryAssets(html: string) {
  const paths: string[] = [];
  for (const match of html.matchAll(HTML_REFERENCE)) {
    const [, value] = match;
    if (value === undefined) {
      throw new Error("Invalid entry asset reference");
    }
    const url = new URL(value, "http://bundle.local/");
    if (url.origin === "http://bundle.local" && CODE_ASSET.test(url.pathname)) {
      paths.push(PATH.parse(decodeURIComponent(url.pathname.slice(1))));
    }
  }
  return [...new Set(paths)].toSorted();
}
function attributeGraph(
  graph: BuildGraph,
  routes: RouteDefinition[],
  entryHtml: string
) {
  const { chunks } = graph.chunkGraph;
  const chunkMap = new Map(chunks.map((chunk) => [chunk.id, chunk]));
  function closure(ids: Iterable<string>) {
    const visited = new Set<string>();
    const pending = [...ids];
    while (pending.length > 0) {
      const id = pending.pop();
      if (id === undefined || visited.has(id)) {
        continue;
      }
      const chunk = chunkMap.get(id);
      if (!chunk) {
        throw new Error(`Missing chunk ${id}`);
      }
      visited.add(id);
      pending.push(...chunk.dependencies);
    }
    return visited;
  }
  function pathsFor(ids: Iterable<string>) {
    return [
      ...new Set(
        [...ids].flatMap(
          (id) =>
            chunkMap.get(id)?.assets.filter((path) => CODE_ASSET.test(path)) ??
            []
        )
      ),
    ].toSorted();
  }
  const initialAssets = [
    "index.html",
    ...new Set([
      ...htmlEntryAssets(entryHtml),
      ...pathsFor(chunks.flatMap((chunk) => (chunk.initial ? [chunk.id] : []))),
    ]),
  ];
  const routeInventory = routes.map((route) => {
    const routePath = resolve(graph.root, route.source).replaceAll("\\", "/");
    const splitModules = graph.moduleGraph.modules.filter(
      (module) => routeComponentPath(module.path) === routePath
    );
    const candidates =
      splitModules.length > 0
        ? splitModules
        : graph.moduleGraph.modules.filter(
            (module) => module.path.replaceAll("\\", "/") === routePath
          );
    const ids = new Set(candidates.map((module) => module.id));
    const direct = chunks.flatMap((chunk) =>
      chunk.modules.some((id) => ids.has(id)) ? [chunk.id] : []
    );
    if (direct.length === 0) {
      throw new Error(
        `Missing emitted route module ${route.id} (${route.source})`
      );
    }
    return {
      ...route,
      directAssets: pathsFor(direct),
      reachableAssets: pathsFor(closure(direct)),
    };
  });
  return { initialAssets, routes: routeInventory };
}
function samePaths(left: string[], right: string[]) {
  return JSON.stringify(left.toSorted()) === JSON.stringify(right.toSorted());
}
function validateEntryHtml(inventory: RouteInventory) {
  const index = inventory.assets.find((asset) => asset.path === "index.html");
  const bytes = Buffer.from(inventory.entryHtml);
  if (
    !index ||
    index.sha256 !== sha256(bytes) ||
    index.raw !== bytes.byteLength ||
    index.gzip !== gzipSync(bytes).byteLength
  ) {
    throw new Error("Entry HTML differs from emitted inventory");
  }
}
function validateAttribution(inventory: RouteInventory) {
  validateEntryHtml(inventory);
  const expected = attributeGraph(
    inventory.graph,
    inventory.routes,
    inventory.entryHtml
  );
  const graphPaths = [
    ...new Set([
      "index.html",
      ...htmlEntryAssets(inventory.entryHtml),
      ...inventory.graph.chunkGraph.assets.flatMap((asset) =>
        CODE_ASSET.test(asset.path) ? [asset.path] : []
      ),
    ]),
  ];
  if (
    !samePaths(
      inventory.assets.map((asset) => asset.path),
      graphPaths
    )
  ) {
    throw new Error("Inventory assets differ from emitted graph");
  }
  if (!samePaths(inventory.initialAssets, expected.initialAssets)) {
    throw new Error("Initial inventory differs from emitted graph");
  }
  const expectedRoutes = new Map(
    expected.routes.map((route) => [route.id, route])
  );
  for (const route of inventory.routes) {
    const attributed = expectedRoutes.get(route.id);
    if (
      !(
        attributed &&
        samePaths(route.directAssets, attributed.directAssets) &&
        samePaths(route.reachableAssets, attributed.reachableAssets)
      )
    ) {
      throw new Error(
        `Route attribution differs from emitted graph: ${route.id}`
      );
    }
  }
}

function collectRouteInventory({
  report,
  routes,
  distDir,
  metadata,
}: {
  report: unknown;
  routes: RouteDefinition[];
  distDir: string;
  metadata: RouteMetadata;
}): RouteInventory {
  const graph = graphSchema.parse(report).data;
  const { assets: graphAssets } = graph.chunkGraph;
  unique(
    routes.map((route) => route.id),
    "route IDs"
  );
  const entryHtml = containedFile(distDir, "index.html").toString("utf8");
  const graphPaths = new Set([
    ...graphAssets.map((asset) => asset.path),
    ...htmlEntryAssets(entryHtml),
  ]);
  const actualPaths = emittedFiles(distDir).toSorted();
  const expectedPaths = [...graphPaths]
    .filter((path) => CODE_ASSET.test(path))
    .toSorted();
  if (JSON.stringify(actualPaths) !== JSON.stringify(expectedPaths)) {
    throw new Error("Emitted asset inventory differs from module graph");
  }
  validateGraphReferences(graph);
  const assetInventory = ["index.html", ...actualPaths].map((path) => {
    const bytes = containedFile(distDir, path);
    return {
      path,
      raw: bytes.byteLength,
      gzip: gzipSync(bytes).byteLength,
      sha256: sha256(bytes),
    };
  });
  return validateRouteInventory({
    schemaVersion: 1,
    metric: "node-gzip-default-js-css-html-v1",
    metadata,
    graph,
    entryHtml,
    buildHash: graph.hash,
    assets: assetInventory,
    ...attributeGraph(graph, routes, entryHtml),
  });
}

function validateRouteInventory(value: unknown): RouteInventory {
  const inventory = inventorySchema.parse(value);
  validateGraphReferences(inventory.graph);
  unique(
    inventory.assets.map((asset) => asset.path),
    "inventory assets"
  );
  unique(
    inventory.routes.map((route) => route.id),
    "inventory routes"
  );
  const assets = new Set(inventory.assets.map((asset) => asset.path));
  const references = [
    inventory.initialAssets,
    ...inventory.routes.flatMap((route) => [
      route.directAssets,
      route.reachableAssets,
    ]),
  ];
  for (const paths of references) {
    unique(paths, "asset references");
    for (const path of paths) {
      if (!assets.has(path)) {
        throw new Error(`Missing inventory asset ${path}`);
      }
    }
  }
  validateAttribution(inventory);
  return inventory;
}

function routeBytes(
  inventory: RouteInventory,
  route: RouteInventory["routes"][number]
) {
  const initial = new Set(inventory.initialAssets);
  const direct = new Set(route.directAssets);
  const counts = new Map<string, number>();
  for (const item of inventory.routes) {
    for (const path of item.reachableAssets) {
      counts.set(path, (counts.get(path) ?? 0) + 1);
    }
  }
  const sum = (paths: string[]) => {
    const selected = new Set(paths);
    return inventory.assets.reduce(
      (total, asset) => total + (selected.has(asset.path) ? asset.gzip : 0),
      0
    );
  };
  const additional = route.reachableAssets.filter((path) => !initial.has(path));
  return {
    direct: sum(additional.filter((path) => direct.has(path))),
    transitive: sum(additional.filter((path) => !direct.has(path))),
    shared: sum(additional.filter((path) => (counts.get(path) ?? 0) > 1)),
    initial: sum(inventory.initialAssets),
    reachable: sum(additional),
  };
}

function routeStatus(
  before: RouteInventory["routes"][number] | undefined,
  after: RouteInventory["routes"][number] | undefined
) {
  if (!before) {
    return "added";
  }
  if (!after) {
    return "deleted";
  }
  return before.source === after.source ? "matched" : "source-renamed";
}

function compareRouteInventories(
  baseValue: unknown,
  headValue: unknown,
  expected: { base: string; head: string }
) {
  const base = validateRouteInventory(baseValue);
  const head = validateRouteInventory(headValue);
  if (
    base.metadata.revision !== REVISION.parse(expected.base) ||
    head.metadata.revision !== REVISION.parse(expected.head)
  ) {
    throw new Error(
      "Inventory revision does not match exact requested base/head"
    );
  }
  if (
    base.metadata.dirty ||
    head.metadata.dirty ||
    base.metadata.buildEnvironmentHash !== head.metadata.buildEnvironmentHash ||
    base.metadata.lockHash !== head.metadata.lockHash ||
    base.metadata.toolchain !== head.metadata.toolchain
  ) {
    throw new Error(
      "Incomparable inventories: dirty source, build environment, lockfile or toolchain mismatch"
    );
  }
  const baseRoutes = new Map(base.routes.map((route) => [route.id, route]));
  const headRoutes = new Map(head.routes.map((route) => [route.id, route]));
  const routes = [...new Set([...baseRoutes.keys(), ...headRoutes.keys()])]
    .toSorted()
    .map((id) => {
      const before = baseRoutes.get(id);
      const after = headRoutes.get(id);
      const baseBytes = before ? routeBytes(base, before) : null;
      const headBytes = after ? routeBytes(head, after) : null;
      return {
        id,
        status: routeStatus(before, after),
        baseSource: before?.source ?? null,
        headSource: after?.source ?? null,
        base: baseBytes,
        head: headBytes,
        delta:
          baseBytes && headBytes
            ? headBytes.reachable - baseBytes.reachable
            : null,
      };
    });
  const total = (inventory: RouteInventory) =>
    inventory.assets.reduce((sum, asset) => sum + asset.gzip, 0);
  return {
    status: "informational",
    baseRevision: expected.base,
    headRevision: expected.head,
    baseTotal: total(base),
    headTotal: total(head),
    routes,
  };
}

export type { RouteDefinition, RouteInventory, RouteMetadata };
export {
  collectRouteInventory,
  compareRouteInventories,
  routeBytes,
  sha256,
  validateRouteInventory,
};
