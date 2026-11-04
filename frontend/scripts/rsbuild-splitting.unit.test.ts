import {
  mkdirSync,
  mkdtempSync,
  readdirSync,
  readFileSync,
  rmSync,
  writeFileSync,
} from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { createRsbuild } from "@rsbuild/core";
import { afterEach, expect, test } from "@rstest/core";
import { z } from "zod";
import { managedSplitChunksConfig } from "../rsbuild.performance";

const sourceMapSchema = z.object({ sources: z.array(z.string()) });
const temporaryDirectories: string[] = [];

afterEach(() => {
  for (const directory of temporaryDirectories.splice(0)) {
    rmSync(directory, { force: true, recursive: true });
  }
});

test("shares a lazy page with its small route wrapper without duplicating it", async () => {
  const cwd = mkdtempSync(join(tmpdir(), "querylane-split-"));
  temporaryDirectories.push(cwd);
  writeFileSync(
    join(cwd, "entry.js"),
    'globalThis.loadPage = () => import("./page.js"); globalThis.loadRoute = () => import("./route.js");'
  );
  writeFileSync(
    join(cwd, "route.js"),
    'import { renderPage } from "./page.js"; export const renderRoute = () => renderPage();'
  );
  // Larger than minSize but smaller than enforceSizeThreshold, like a page
  // reached both through the admin renderer and a small split route wrapper.
  writeFileSync(
    join(cwd, "page.js"),
    `export const renderPage = () => ${JSON.stringify("shared-page-content-".repeat(1000))};`
  );
  const rsbuild = await createRsbuild({
    cwd,
    rsbuildConfig: {
      logLevel: "error",
      output: { minify: false, sourceMap: { js: "source-map" } },
      performance: { buildCache: false, printFileSize: false },
      source: { entry: { index: "./entry.js" } },
      splitChunks: managedSplitChunksConfig,
    },
  });
  const result = await rsbuild.build();
  try {
    const dist = join(cwd, "dist");
    const pageChunks = readdirSync(dist, { encoding: "utf8", recursive: true })
      .filter((file) => file.endsWith(".js.map"))
      .filter((file) => {
        const sourceMap = sourceMapSchema.parse(
          JSON.parse(readFileSync(join(dist, file), "utf8"))
        );
        return sourceMap.sources.some((source) => source.endsWith("/page.js"));
      });

    expect(pageChunks).toHaveLength(1);
    expect(pageChunks[0]?.replaceAll("\\", "/")).toContain("static/js/async/");
  } finally {
    await result.close();
  }
});

test("emits a small shared AIP filter once across lazy consumers", async () => {
  const cwd = mkdtempSync(join(tmpdir(), "querylane-filter-split-"));
  temporaryDirectories.push(cwd);
  mkdirSync(join(cwd, "src/lib/domain"), { recursive: true });
  mkdirSync(join(cwd, "src/components/querylane-ui"), { recursive: true });
  writeFileSync(
    join(cwd, "entry.js"),
    'globalThis.loadA = () => import("./a.js"); globalThis.loadB = () => import("./b.js"); globalThis.loadC = () => import("./c.js");'
  );
  writeFileSync(
    join(cwd, "src/lib/domain/aip-filter.js"),
    'export const filter = value => "name = " + JSON.stringify(value);'
  );
  writeFileSync(
    join(cwd, "src/components/querylane-ui/shared.js"),
    `export const label = ${JSON.stringify("shared-control-".repeat(2000))};`
  );
  for (const name of ["a", "b", "c"]) {
    writeFileSync(
      join(cwd, `${name}.js`),
      'import {filter} from "./src/lib/domain/aip-filter.js"; import {label} from "./src/components/querylane-ui/shared.js"; export const render = value => label + filter(value);'
    );
  }
  const rsbuild = await createRsbuild({
    cwd,
    rsbuildConfig: {
      logLevel: "error",
      output: { minify: false, sourceMap: { js: "source-map" } },
      performance: { buildCache: false, printFileSize: false },
      source: { entry: { index: "./entry.js" } },
      splitChunks: managedSplitChunksConfig,
    },
  });
  const result = await rsbuild.build();
  try {
    const dist = join(cwd, "dist");
    const copies = readdirSync(dist, { encoding: "utf8", recursive: true })
      .filter((file) => file.endsWith(".js.map"))
      .filter((file) =>
        sourceMapSchema
          .parse(JSON.parse(readFileSync(join(dist, file), "utf8")))
          .sources.some((source) => source.endsWith("/aip-filter.js"))
      );
    expect(copies).toHaveLength(1);
    expect(copies[0]).toContain("shared-ui");
  } finally {
    await result.close();
  }
});
