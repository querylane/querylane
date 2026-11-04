import { mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, expect, test } from "@rstest/core";
import {
  collectRouteInventory,
  compareRouteInventories,
} from "./route-byte-inventory";

const temporaryDirectories: string[] = [];
afterEach(() => {
  for (const directory of temporaryDirectories.splice(0)) {
    rmSync(directory, { recursive: true });
  }
});

const BASE = "1".repeat(40);
const HEAD = "2".repeat(40);
const DIGEST = "a".repeat(64);
const metadata = {
  revision: BASE,
  dirty: false,
  sourceHash: DIGEST,
  configHash: DIGEST,
  lockHash: DIGEST,
  toolchain: "fixture",
  graphHash: DIGEST,
  buildEnvironmentHash: DIGEST,
};
const routes = [
  { id: "/explorer", source: "src/routes/explorer.tsx" },
  { id: "/workbench", source: "src/routes/workbench.tsx" },
];

function fixture() {
  const distDir = mkdtempSync(join(tmpdir(), "route-bytes-"));
  temporaryDirectories.push(distDir);
  // Literal gzip lengths for Node's default gzip encoding, not module sizes.
  const files: [string, string][] = [
    ["index.html", "<html></html>"],
    ["main.js", "hello"],
    ["shared.js", "hello"],
    ["explorer.js", "world"],
    ["workbench.js", "hello"],
    ["heavy.js", "x".repeat(10_000)],
  ];
  for (const [path, text] of files) {
    writeFileSync(join(distDir, path), text);
  }
  const graph = {
    hash: "fixture-build",
    root: "/fixture",
    chunkGraph: {
      assets: [
        "main.js",
        "shared.js",
        "explorer.js",
        "workbench.js",
        "heavy.js",
      ].map((path) => ({ path })),
      chunks: [
        {
          id: "main",
          initial: true,
          assets: ["main.js"],
          modules: [1],
          dependencies: [],
        },
        {
          id: "shared",
          initial: false,
          assets: ["shared.js"],
          modules: [2],
          dependencies: [],
        },
        {
          id: "explorer",
          initial: false,
          assets: ["explorer.js"],
          modules: [3],
          dependencies: ["shared"],
        },
        {
          id: "workbench",
          initial: false,
          assets: ["workbench.js"],
          modules: [4],
          dependencies: ["shared"],
        },
        {
          id: "heavy",
          initial: false,
          assets: ["heavy.js"],
          modules: [5],
          dependencies: [],
        },
      ],
    },
    moduleGraph: {
      modules: [
        { id: 1, path: "/fixture/src/main.tsx" },
        { id: 2, path: "/fixture/src/shared.tsx" },
        {
          id: 3,
          path: "/fixture/src/routes/explorer.tsx?tsr-split=component---errorComponent---notFoundComponent",
        },
        {
          id: 4,
          path: "/fixture/src/routes/workbench.tsx?tsr-split=component",
        },
        { id: 5, path: "/fixture/src/heavy.tsx" },
      ],
    },
  };
  return { distDir, graph };
}

test("attributes actual emitted gzip bytes and grouped route splits without summing routes as a total", () => {
  const { graph, distDir } = fixture();
  const inventory = collectRouteInventory({
    report: { data: graph },
    routes,
    distDir,
    metadata,
  });
  const comparison = compareRouteInventories(inventory, inventory, {
    base: BASE,
    head: BASE,
  });
  expect(
    inventory.assets.find((asset) => asset.path === "heavy.js")
  ).toMatchObject({ raw: 10_000, gzip: 45 });
  expect(comparison.routes).toEqual([
    expect.objectContaining({
      id: "/explorer",
      status: "matched",
      base: {
        direct: 25,
        transitive: 25,
        shared: 25,
        initial: 54,
        reachable: 50,
      },
      head: {
        direct: 25,
        transitive: 25,
        shared: 25,
        initial: 54,
        reachable: 50,
      },
      delta: 0,
    }),
    expect.objectContaining({ id: "/workbench", status: "matched", delta: 0 }),
  ]);
  expect(comparison.baseTotal).toBe(174);
});

test("attributes a heavy async dependency to its owning route, not unrelated routes", () => {
  const { graph, distDir } = fixture();
  const baseGraph = structuredClone(graph);
  baseGraph.chunkGraph.assets = baseGraph.chunkGraph.assets.filter(
    (asset) => asset.path !== "heavy.js"
  );
  baseGraph.chunkGraph.chunks = baseGraph.chunkGraph.chunks.filter(
    (chunk) => chunk.id !== "heavy"
  );
  baseGraph.moduleGraph.modules = baseGraph.moduleGraph.modules.filter(
    (module) => module.id !== 5
  );
  rmSync(join(distDir, "heavy.js"));
  const base = collectRouteInventory({
    report: { data: baseGraph },
    routes,
    distDir,
    metadata,
  });
  writeFileSync(join(distDir, "heavy.js"), "x".repeat(10_000));
  const explorer = graph.chunkGraph.chunks.find(
    (chunk) => chunk.id === "explorer"
  );
  if (!explorer) {
    throw new Error("Missing fixture route chunk");
  }
  explorer.dependencies.push("heavy");
  const head = collectRouteInventory({
    report: { data: graph },
    routes,
    distDir,
    metadata: { ...metadata, revision: HEAD },
  });
  const comparison = compareRouteInventories(base, head, {
    base: BASE,
    head: HEAD,
  });
  expect(comparison.baseTotal).toBe(129);
  expect(comparison.headTotal).toBe(174);
  expect(comparison.routes).toEqual([
    expect.objectContaining({
      id: "/explorer",
      delta: 45,
      head: {
        direct: 25,
        transitive: 70,
        shared: 25,
        initial: 54,
        reachable: 95,
      },
    }),
    expect.objectContaining({ id: "/workbench", delta: 0 }),
  ]);
});

test("route URL renames are explicit deletion/addition with unknown deltas; file renames stay explicit", () => {
  const { graph, distDir } = fixture();
  const base = collectRouteInventory({
    report: { data: graph },
    routes,
    distDir,
    metadata,
  });
  const head = structuredClone(base);
  head.metadata.revision = HEAD;
  const [explorer, workbench] = head.routes;
  if (!(explorer && workbench)) {
    throw new Error("Missing fixture routes");
  }
  explorer.id = "/catalog";
  workbench.source = "src/routes/query.tsx";
  const renamedModule = head.graph.moduleGraph.modules.find(
    (module) => module.id === 4
  );
  if (!renamedModule) {
    throw new Error("Missing fixture module");
  }
  renamedModule.path = "/fixture/src/routes/query.tsx?tsr-split=component";
  const comparison = compareRouteInventories(base, head, {
    base: BASE,
    head: HEAD,
  });
  expect(comparison.routes).toEqual([
    expect.objectContaining({
      id: "/catalog",
      status: "added",
      base: null,
      delta: null,
    }),
    expect.objectContaining({
      id: "/explorer",
      status: "deleted",
      head: null,
      delta: null,
    }),
    expect.objectContaining({
      id: "/workbench",
      status: "source-renamed",
      baseSource: "src/routes/workbench.tsx",
      headSource: "src/routes/query.tsx",
      delta: 0,
    }),
  ]);
});

test("missing files, absent graphs and dangling chunk/module references cannot become zero bytes", () => {
  const { graph, distDir } = fixture();
  expect(() =>
    collectRouteInventory({ report: {}, routes, distDir, metadata })
  ).toThrow();
  const missingModule = structuredClone(graph);
  missingModule.moduleGraph.modules = [];
  expect(() =>
    collectRouteInventory({
      report: { data: missingModule },
      routes,
      distDir,
      metadata,
    })
  ).toThrow();
  const missingChunk = structuredClone(graph);
  missingChunk.chunkGraph.chunks = missingChunk.chunkGraph.chunks.filter(
    (chunk) => chunk.id !== "shared"
  );
  expect(() =>
    collectRouteInventory({
      report: { data: missingChunk },
      routes,
      distDir,
      metadata,
    })
  ).toThrow("Missing dependency chunk shared");
  const missingFile = structuredClone(graph);
  missingFile.chunkGraph.assets.push({ path: "missing.js" });
  expect(() =>
    collectRouteInventory({
      report: { data: missingFile },
      routes,
      distDir,
      metadata,
    })
  ).toThrow("Emitted asset inventory differs");
});

test("an emitted asset without owning chunks is an invalid inventory, not unassigned zero growth", () => {
  const { graph, distDir } = fixture();
  graph.chunkGraph.chunks = graph.chunkGraph.chunks.filter(
    (chunk) => chunk.id !== "heavy"
  );
  expect(() =>
    collectRouteInventory({
      report: { data: graph },
      routes,
      distDir,
      metadata,
    })
  ).toThrow("Missing asset chunk ownership: heavy.js");
});

test("rejects invalid gzip records, incomplete asset references and incomparable revisions", () => {
  const { graph, distDir } = fixture();
  const base = collectRouteInventory({
    report: { data: graph },
    routes,
    distDir,
    metadata,
  });
  const head = structuredClone(base);
  head.metadata.revision = HEAD;
  const expected = { base: BASE, head: HEAD };
  expect(() => compareRouteInventories(null, head, expected)).toThrow();
  expect(() =>
    compareRouteInventories(base, head, { ...expected, head: BASE })
  ).toThrow("exact requested base/head");
  expect(() =>
    compareRouteInventories(base, { ...head, assets: [] }, expected)
  ).toThrow();
  const [asset] = head.assets;
  if (!asset) {
    throw new Error("Missing fixture asset");
  }
  asset.gzip = -1;
  expect(() => compareRouteInventories(base, head, expected)).toThrow();
  asset.gzip = 29;
  head.initialAssets.push("absent.js");
  expect(() => compareRouteInventories(base, head, expected)).toThrow(
    "Missing inventory asset absent.js"
  );
  head.initialAssets.pop();
  head.metadata.dirty = true;
  expect(() => compareRouteInventories(base, head, expected)).toThrow(
    "Incomparable inventories"
  );
  head.metadata.dirty = false;
  head.metadata.lockHash = "b".repeat(64);
  expect(() => compareRouteInventories(base, head, expected)).toThrow(
    "Incomparable inventories"
  );
});

test("rejects an omitted unreferenced emitted asset or falsified route attribution in a saved inventory", () => {
  const { graph, distDir } = fixture();
  const base = collectRouteInventory({
    report: { data: graph },
    routes,
    distDir,
    metadata,
  });
  const omitted = structuredClone(base);
  omitted.assets = omitted.assets.filter((asset) => asset.path !== "heavy.js");
  expect(() =>
    compareRouteInventories(base, omitted, { base: BASE, head: BASE })
  ).toThrow("Inventory assets differ from emitted graph");
  const falsified = structuredClone(base);
  const [explorer] = falsified.routes;
  if (!explorer) {
    throw new Error("Missing fixture route");
  }
  explorer.reachableAssets = ["explorer.js"];
  expect(() =>
    compareRouteInventories(base, falsified, { base: BASE, head: BASE })
  ).toThrow("Route attribution differs from emitted graph: /explorer");
});

test("counts copied entry scripts absent from the module graph, but rejects unlinked extra scripts", () => {
  const { graph, distDir } = fixture();
  writeFileSync(
    join(distDir, "index.html"),
    '<html><script src="/theme-init.js"></script></html>'
  );
  writeFileSync(join(distDir, "theme-init.js"), "hello");
  const inventory = collectRouteInventory({
    report: { data: graph },
    routes,
    distDir,
    metadata,
  });
  expect(inventory.initialAssets).toContain("theme-init.js");
  expect(
    inventory.assets.find((asset) => asset.path === "theme-init.js")
  ).toMatchObject({ raw: 5, gzip: 25 });
  writeFileSync(join(distDir, "unlinked.js"), "hello");
  expect(() =>
    collectRouteInventory({
      report: { data: graph },
      routes,
      distDir,
      metadata,
    })
  ).toThrow("Emitted asset inventory differs");
});
