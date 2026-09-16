import { Rule } from "@rsdoctor/core/rules";
import {
  Chunk,
  ChunkGraph,
  Module,
  ModuleGraph,
  PackageGraph,
} from "@rsdoctor/graph";
import { RsdoctorRspackPlugin } from "@rsdoctor/rspack-plugin";
import type { SDK } from "@rsdoctor/types";
import { expect, test } from "@rstest/core";
import {
  heavyPackagesStayDeferred,
  noShikiOniguruma,
  routesStaySplit,
} from "./rsdoctor-bundle-contracts";

function buildGraph(): SDK.RuntimeContext {
  return {
    root: "/app",
    configs: [],
    errors: [],
    loader: [],
    chunkGraph: new ChunkGraph(),
    moduleGraph: new ModuleGraph(),
    packageGraph: new PackageGraph("/app"),
  };
}

function createModule(path: string) {
  // Use the graph's SDK factory: the concrete Module class has incompatible
  // exact-optional declarations for renderId and rootModule in Rsdoctor 1.6.4.
  const data = new Module(path, path).toData();
  const module = ModuleGraph.fromData({ modules: [data] }).getModuleById(
    data.id
  );
  if (!module) {
    throw new Error(`Failed to create graph module ${path}`);
  }
  return module;
}

function emitModule(
  context: SDK.RuntimeContext,
  path: string,
  initial = false
) {
  // Initial vendor chunks are not necessarily entry chunks.
  const chunk = new Chunk(
    `chunk-${context.chunkGraph.getChunks().length}`,
    "vendor",
    1,
    initial,
    false
  );
  const module = createModule(path);
  module.addChunk(chunk);
  chunk.addModule(module);
  context.moduleGraph.addModule(module);
  context.chunkGraph.addChunk(chunk);
  return { chunk, module };
}

test("rejects a heavy package in an initial non-entry vendor chunk", async () => {
  const context = buildGraph();
  emitModule(context, "/app/node_modules/@tanstack/charts/dist/index.js", true);

  const result = await Rule.from(heavyPackagesStayDeferred).validate(context);

  expect(result.errors).toEqual([
    expect.objectContaining({
      severity: 2,
      message: expect.stringContaining("@tanstack/charts"),
    }),
  ]);
  expect(result.errors[0]?.message).toContain("chunk-0");
});

test("finds heavy modules inside concatenated application modules", async () => {
  const context = buildGraph();
  const { module } = emitModule(context, "/app/src/main.tsx", true);
  const nested = createModule("/app/src/feature.ts");
  nested.addNormalModule(
    createModule("C:\\app\\node_modules\\@shikijs\\core\\dist\\index.mjs")
  );
  module.addNormalModule(nested);

  const result = await Rule.from(heavyPackagesStayDeferred).validate(context);

  expect(result.errors).toHaveLength(1);
  expect(result.errors[0]?.message).toContain("@shikijs");
});

test.each([
  "@tanstack/charts",
  "@xyflow/react",
  "d3-force",
  "react-data-grid",
  "chrono-node",
  "shiki",
  "@shikijs/engine-javascript",
  "oniguruma-to-es",
  "oniguruma-parser",
])("keeps %s deferred without banning it", async (packageName) => {
  const context = buildGraph();
  emitModule(context, `/app/node_modules/${packageName}/index.js`, true);
  expect(
    (await Rule.from(heavyPackagesStayDeferred).validate(context)).errors
  ).toHaveLength(1);

  const deferred = buildGraph();
  emitModule(deferred, `/app/node_modules/${packageName}/index.js`);
  expect(
    (await Rule.from(heavyPackagesStayDeferred).validate(deferred)).errors
  ).toEqual([]);
});

test("ignores tree-shaken modules, package-name lookalikes, and shared route CSS", async () => {
  const context = buildGraph();
  context.moduleGraph.addModule(
    createModule("/app/node_modules/shiki/index.js")
  );
  emitModule(context, "/app/node_modules/react/index.js", true);
  emitModule(context, "/app/node_modules/shiki-helper/index.js", true);
  emitModule(context, "/app/src/routes/shared.css", true);
  emitModule(context, "/app/src/routes/shared.css");

  expect(
    (await Rule.from(heavyPackagesStayDeferred).validate(context)).errors
  ).toEqual([]);
});

test.each([
  "@shikijs/engine-oniguruma/dist/index.mjs",
  "@shikijs/engine-oniguruma/dist/wasm-inlined.mjs",
  "shiki/dist/engine/oniguruma.mjs",
  "shiki/dist/wasm.mjs",
  "shiki/dist/onig.wasm?url",
])(
  "rejects emitted Oniguruma implementation %s even in async chunks",
  async (path) => {
    const context = buildGraph();
    const { module } = emitModule(context, "/app/src/highlighter.ts");
    module.addNormalModule(createModule(`/app/node_modules/${path}`));

    const result = await Rule.from(noShikiOniguruma).validate(context);

    expect(result.errors).toEqual([
      expect.objectContaining({
        severity: 2,
        message: expect.stringContaining(path),
      }),
    ]);
  }
);

test("allows Shiki's JavaScript regex engine and excludes unused Oniguruma modules", async () => {
  const context = buildGraph();
  for (const path of [
    "shiki/dist/engine/javascript.mjs",
    "@shikijs/engine-javascript/dist/index.mjs",
    "oniguruma-to-es/dist/index.js",
    "oniguruma-parser/dist/index.js",
    "unrelated/compute.wasm",
  ]) {
    emitModule(context, `/app/node_modules/${path}`);
  }
  context.moduleGraph.addModule(
    createModule("/app/node_modules/@shikijs/engine-oniguruma/dist/index.mjs")
  );

  expect((await Rule.from(noShikiOniguruma).validate(context)).errors).toEqual(
    []
  );
});

const ROUTES = [
  "index.tsx",
  "new-instance.tsx",
  "instances/$instanceId/index.tsx",
  "instances/$instanceId/databases/$databaseId/explorer.tsx",
];

function splitRoutes(group = "component") {
  const context = buildGraph();
  for (const route of ROUTES) {
    emitModule(context, `/app/src/routes/${route}`, true);
    const { module } = emitModule(
      context,
      `/app/src/routes/${route}?tsr-split=${group}`
    );
    module.addNormalModule(
      createModule(`/app/src/routes/${route}?tsr-split=${group}`)
    );
  }
  return context;
}

test.each(["component", "component---errorComponent---notFoundComponent"])(
  "allows eager configuration and async component proxies grouped as %s",
  async (group) => {
    expect(
      (await Rule.from(routesStaySplit).validate(splitRoutes(group))).errors
    ).toEqual([]);
  }
);

test("fails closed when route splitting disappears despite unrelated async chunks", async () => {
  const context = buildGraph();
  emitModule(context, "/app/src/routes/__root.tsx", true);
  emitModule(context, "/app/node_modules/shiki/dist/core.mjs");

  const result = await Rule.from(routesStaySplit).validate(context);

  expect(result.errors).toHaveLength(4);
  expect(result.errors.every((error) => error.severity === 2)).toBe(true);
  expect(result.errors[0]?.message).toContain("index.tsx");
});

test("rejects a single missing route split even when the other routes still split", async () => {
  const context = splitRoutes();
  context.chunkGraph.setChunks(
    context.chunkGraph.getChunks().filter((chunk) => chunk.id !== "chunk-3")
  );

  const result = await Rule.from(routesStaySplit).validate(context);

  expect(result.errors).toHaveLength(1);
  expect(result.errors[0]?.message).toContain("new-instance.tsx");
});

test.each(["component", "component---errorComponent---notFoundComponent"])(
  "rejects an initial %s copy even if an async copy remains",
  async (group) => {
    const context = splitRoutes();
    emitModule(
      context,
      `/app/src/routes/new-instance.tsx?tsr-split=${group}`,
      true
    );

    const result = await Rule.from(routesStaySplit).validate(context);

    expect(result.errors).toHaveLength(1);
    expect(result.errors[0]?.message).toContain("chunk-8");
  }
);

test("does not mistake fallback-only splits for component splits", async () => {
  const result = await Rule.from(routesStaySplit).validate(
    splitRoutes("errorComponent---notFoundComponent")
  );
  expect(result.errors).toHaveLength(4);
});

test.each([
  {
    name: "heavy imports",
    contract: heavyPackagesStayDeferred,
    path: "/app/node_modules/shiki/dist/core.mjs",
  },
  {
    name: "route splits",
    contract: routesStaySplit,
    path: "/app/src/main.tsx",
  },
  {
    name: "Oniguruma",
    contract: noShikiOniguruma,
    path: "/app/node_modules/@shikijs/engine-oniguruma/dist/index.mjs",
  },
])(
  "fails the build for $name, not just reporting errors",
  async ({ contract, path }) => {
    const data = buildGraph();
    emitModule(data, path, true);
    const rule = Rule.from(contract);
    const validateResult = await rule.validate(data);
    const { hooks } = new RsdoctorRspackPlugin({ disableClientServer: true })
      .sdk;

    await expect(
      rule.afterValidate({ data, validateResult, hooks })
    ).rejects.toThrow(contract.meta.title);
  }
);

test("leaves unrelated Rsdoctor findings advisory", async () => {
  const data = buildGraph();
  const rule = Rule.from(heavyPackagesStayDeferred);
  const validateResult = await rule.validate(data);
  const { hooks } = new RsdoctorRspackPlugin({ disableClientServer: true }).sdk;
  validateResult.errors.push({
    title: "DUPLICATE-PACKAGE",
    message: "Advisory duplicate",
    severity: 2,
    category: "bundle",
    code: "E1001",
  });

  await expect(
    rule.afterValidate({ data, validateResult, hooks })
  ).resolves.toBeUndefined();
});
