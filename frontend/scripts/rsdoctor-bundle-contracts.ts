import { defineRule } from "@rsdoctor/core/rules";
import { Err, type Linter, type SDK } from "@rsdoctor/types";

// Keep this list limited to intentionally deferred feature dependencies, not
// every vendor package. oniguruma-to-es/parser power Shiki's allowed JS engine.
const HEAVY_PACKAGE =
  /\/node_modules\/(@tanstack\/charts|@xyflow\/[^/]+|d3-[^/]+|react-data-grid|chrono-node|shiki|@shikijs\/[^/]+|oniguruma-to-es|oniguruma-parser)\//;
const SHIKI_ONIGURUMA =
  /\/node_modules\/(?:@shikijs\/engine-oniguruma\/|shiki\/dist\/(?:engine\/oniguruma\.mjs|wasm\.mjs|onig\.wasm)(?:$|[?#]))/;
// Representative landing, form, overview, and explorer boundaries. Deliberate
// sentinels: unrelated async vendor chunks cannot satisfy route splitting.
const REQUIRED_ROUTE_SPLITS = [
  "index.tsx",
  "new-instance.tsx",
  "instances/$instanceId/index.tsx",
  "instances/$instanceId/databases/$databaseId/explorer.tsx",
];

function* emittedModules(chunkGraph: SDK.ChunkGraphInstance) {
  for (const chunk of chunkGraph.getChunks()) {
    const pending = [...chunk.getModules()];
    const visited = new Set<SDK.ModuleInstance>();
    while (pending.length > 0) {
      const module = pending.pop();
      if (!module || visited.has(module)) {
        continue;
      }
      visited.add(module);
      yield { chunk, module };
      // Concatenated children have no direct chunks of their own. Traversing
      // from emitted chunks also excludes modules removed by tree-shaking.
      pending.push(...module.getNormalModules());
    }
  }
}

function enforceBundleContracts({
  validateResult,
}: Pick<Linter.RuleCheckerContextForCheckEnd, "validateResult">): void {
  // Rsdoctor 1.6.4 forwards even Error findings to compilation.warnings.
  // Fail only our contracts, after every rule has reported its diagnostics.
  const titles = new Set(
    bundleContractRules.map((rule) => rule.meta.title.toUpperCase())
  );
  const failures = validateResult.errors.filter(
    (error) =>
      error.severity === Err.ErrorLevel.Error && titles.has(error.title)
  );
  if (failures.length > 0) {
    throw new Error(
      failures
        .map((error) => `[${error.title.toLowerCase()}] ${error.message}`)
        .join("\n")
    );
  }
}

function routeComponentPath(modulePath: string) {
  const [path = "", query] = modulePath.replaceAll("\\", "/").split("?");
  // TanStack encodes grouped split targets with `---` separators.
  const targets = new URLSearchParams(query).get("tsr-split")?.split("---");
  return targets?.includes("component") ? path : "";
}

export const heavyPackagesStayDeferred = defineRule(() => ({
  meta: {
    category: "bundle",
    severity: "Error",
    title: "querylane-heavy-packages-stay-deferred",
  },
  onCheckEnd: enforceBundleContracts,
  check({ chunkGraph, report }) {
    const reportedPackages = new Set<string>();
    for (const { chunk, module } of emittedModules(chunkGraph)) {
      const packageName = HEAVY_PACKAGE.exec(
        module.path.replaceAll("\\", "/")
      )?.[1];
      if (!(chunk.initial && packageName)) {
        continue;
      }
      const key = `${chunk.id}:${packageName}`;
      if (!reportedPackages.has(key)) {
        reportedPackages.add(key);
        report({
          message: `Heavy module ${module.path} is in initial chunk ${chunk.id} (${chunk.name}). Keep its feature behind a dynamic import.`,
        });
      }
    }
  },
}));

export const noShikiOniguruma = defineRule(() => ({
  meta: {
    category: "bundle",
    severity: "Error",
    title: "querylane-no-shiki-oniguruma",
  },
  onCheckEnd: enforceBundleContracts,
  check({ chunkGraph, report }) {
    const reported = new Set<string>();
    for (const { chunk, module } of emittedModules(chunkGraph)) {
      const path = module.path.replaceAll("\\", "/");
      if (SHIKI_ONIGURUMA.test(path) && !reported.has(path)) {
        reported.add(path);
        report({
          message: `Forbidden Shiki Oniguruma/WASM module ${module.path} in chunk ${chunk.id} (${chunk.name}). Use shiki/core with shiki/engine/javascript.`,
        });
      }
    }
  },
}));

export const routesStaySplit = defineRule(() => ({
  meta: {
    category: "bundle",
    severity: "Error",
    title: "querylane-routes-stay-split",
  },
  onCheckEnd: enforceBundleContracts,
  check({ chunkGraph, root, report }) {
    const expected = new Map(
      REQUIRED_ROUTE_SPLITS.map((route) => [
        `${root.replaceAll("\\", "/")}/src/routes/${route}`,
        new Set<SDK.ChunkInstance>(),
      ])
    );
    for (const { chunk, module } of emittedModules(chunkGraph)) {
      expected.get(routeComponentPath(module.path))?.add(chunk);
    }
    for (const [path, chunks] of expected) {
      if (chunks.size === 0) {
        report({
          message: `Missing emitted route component split ${path}. Check TanStack Router autoCodeSplitting and component exports.`,
        });
      }
      for (const chunk of [...chunks].filter(
        (candidate) => candidate.initial
      )) {
        report({
          message: `Route component split ${path} is in initial chunk ${chunk.id} (${chunk.name}). Keep route components behind their lazy boundary.`,
        });
      }
    }
  },
}));

export const bundleContractRules = [
  heavyPackagesStayDeferred,
  routesStaySplit,
  noShikiOniguruma,
];
