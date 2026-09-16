import {
  mkdirSync,
  mkdtempSync,
  readFileSync,
  rmSync,
  writeFileSync,
} from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { createRsbuild } from "@rsbuild/core";
import { expect, test } from "@rstest/core";
import { managedSplitChunksConfig } from "../rsbuild.performance";

test("deduplicates small shared CSS without extracting initial or single-route styles", async () => {
  const root = mkdtempSync(path.join(tmpdir(), "querylane-async-css-"));
  const dist = path.join(root, "dist");
  // Vendor paths also match the existing JS cache groups. The CSS group must
  // win without collecting the diagram's single-consumer stylesheet.
  const fixtures = {
    "index.js": `import './initial.css';
      globalThis.loadFirst = () => import('./first.js');
      globalThis.loadSecond = () => import('./second.js');
      globalThis.loadDiagram = () => import('./diagram.js');`,
    "initial.css": ".initial-only { color: black; }",
    "first.js": `import './node_modules/react-data-grid/styles.css';
      import './theme.css'; import './first.css';`,
    "second.js": `import './node_modules/react-data-grid/styles.css';
      import './theme.css';`,
    "diagram.js": "import './node_modules/@xyflow/react/style.css';",
    "node_modules/react-data-grid/styles.css": ".grid-vendor { color: red; }",
    "theme.css": ".grid-theme { color: blue; }",
    "first.css": ".first-only { color: green; }",
    "node_modules/@xyflow/react/style.css": ".diagram-only { color: purple; }",
  };

  try {
    for (const [file, contents] of Object.entries(fixtures)) {
      const target = path.join(root, file);
      mkdirSync(path.dirname(target), { recursive: true });
      writeFileSync(target, contents);
    }

    const rsbuild = await createRsbuild({
      cwd: root,
      config: {
        mode: "production",
        source: { entry: { index: path.join(root, "index.js") } },
        output: { distPath: { root: dist }, minify: false },
        performance: { buildCache: false, printFileSize: false },
        splitChunks: managedSplitChunksConfig,
      },
    });
    const result = await rsbuild.build();

    try {
      const stats = result.stats?.toJson({
        all: false,
        assets: true,
        chunks: true,
      });
      const cssAssets = (stats?.assets ?? [])
        .filter((asset) => asset.name.endsWith(".css"))
        .map((asset) => ({
          name: asset.name,
          css: readFileSync(path.join(dist, asset.name), "utf8"),
        }));
      const sharedAssets = cssAssets.filter((asset) =>
        asset.name.includes("shared-async-styles")
      );

      expect(sharedAssets).toHaveLength(1);
      const [shared] = sharedAssets;
      expect(shared?.css).toContain(".grid-vendor");
      expect(shared?.css).toContain(".grid-theme");
      expect(shared?.css).not.toContain(".initial-only");
      expect(shared?.css).not.toContain(".first-only");
      expect(shared?.css).not.toContain(".diagram-only");

      for (const selector of [".grid-vendor", ".grid-theme"]) {
        expect(
          cssAssets.filter((asset) => asset.css.includes(selector))
        ).toEqual(sharedAssets);
      }

      const sharedChunk = stats?.chunks?.find((chunk) =>
        chunk.names?.includes("shared-async-styles")
      );
      expect(sharedChunk?.initial).toBe(false);
      expect(sharedChunk?.files).toEqual([shared?.name]);

      const html = readFileSync(path.join(dist, "index.html"), "utf8");
      expect(html).not.toContain("shared-async-styles");
      for (const selector of [
        ".initial-only",
        ".first-only",
        ".diagram-only",
      ]) {
        const assets = cssAssets.filter((asset) =>
          asset.css.includes(selector)
        );
        expect(assets).toHaveLength(1);
        expect(html.includes(assets[0]?.name ?? "")).toBe(
          selector === ".initial-only"
        );
      }
    } finally {
      await result.close();
    }
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});
