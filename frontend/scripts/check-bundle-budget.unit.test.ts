import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";
import { brotliCompressSync, gzipSync } from "node:zlib";
import { afterEach, describe, expect, test } from "vitest";
import { collectBundleBudgetStats } from "./check-bundle-budget";

const tempDirs: string[] = [];

function createDistDir() {
  const dir = mkdtempSync(join(tmpdir(), "querylane-budget-"));
  tempDirs.push(dir);
  return dir;
}

function writeAsset(root: string, relativePath: string, contents: string) {
  const absolutePath = join(root, relativePath);
  mkdirSync(dirname(absolutePath), { recursive: true });
  writeFileSync(absolutePath, contents);
}

afterEach(() => {
  for (const dir of tempDirs.splice(0)) {
    rmSync(dir, { force: true, recursive: true });
  }
});

describe("collectBundleBudgetStats", () => {
  test("keeps deferred visualization chunks out of the core total budget", () => {
    const distDir = createDistDir();
    writeAsset(
      distDir,
      "index.html",
      '<script src="/static/js/index.js"></script>'
    );
    writeAsset(distDir, "static/js/index.js", "console.log('core');");
    writeAsset(
      distDir,
      "static/js/async/flow.js",
      "console.log('react flow');"
    );
    writeAsset(
      distDir,
      "static/js/async/flow.js.map",
      JSON.stringify({
        sources: ["../../../../node_modules/@xyflow/react/dist/esm/index.js"],
      })
    );
    writeAsset(
      distDir,
      "static/js/async/database-map.js",
      "console.log('database map');"
    );
    writeAsset(
      distDir,
      "static/js/async/database-map.js.map",
      JSON.stringify({
        sources: [
          "../../../../src/features/database-visualization/flow-canvas.tsx",
        ],
      })
    );
    writeAsset(
      distDir,
      "static/js/async/data-explorer.js",
      "console.log('data explorer');"
    );

    const stats = collectBundleBudgetStats({
      distDir,
      indexHtmlPath: join(distDir, "index.html"),
    });

    expect(
      stats.deferredVisualizationAssets.map((asset) => asset.path).toSorted()
    ).toEqual(["static/js/async/database-map.js", "static/js/async/flow.js"]);
    expect(stats.coreAssets.map((asset) => asset.path).toSorted()).toEqual([
      "index.html",
      "static/js/async/data-explorer.js",
      "static/js/index.js",
    ]);
    expect(stats.coreTotalGzip).toBeLessThan(stats.totalGzip);
  });

  test("keeps deferred SQL highlighter chunks out of the core total budget", () => {
    const distDir = createDistDir();
    writeAsset(
      distDir,
      "index.html",
      '<script src="/static/js/index.js"></script>'
    );
    writeAsset(distDir, "static/js/index.js", "console.log('core');");
    writeAsset(
      distDir,
      "static/js/async/sql-highlighter.js",
      "console.log('shiki');"
    );
    writeAsset(
      distDir,
      "static/js/async/sql-highlighter.js.map",
      JSON.stringify({
        sources: ["../../../../node_modules/@shikijs/langs/dist/sql.mjs"],
      })
    );
    writeAsset(
      distDir,
      "static/js/async/data-explorer.js",
      "console.log('data explorer');"
    );

    const stats = collectBundleBudgetStats({
      distDir,
      indexHtmlPath: join(distDir, "index.html"),
    });

    expect(
      stats.deferredSqlHighlighterAssets.map((asset) => asset.path)
    ).toEqual(["static/js/async/sql-highlighter.js"]);
    expect(stats.coreAssets.map((asset) => asset.path).toSorted()).toEqual([
      "index.html",
      "static/js/async/data-explorer.js",
      "static/js/index.js",
    ]);
    expect(stats.coreTotalGzip).toBeLessThan(stats.totalGzip);
  });

  test("reports raw, gzip, brotli, and initial request counts", () => {
    const distDir = createDistDir();
    const indexHtmlPath = join(distDir, "index.html");
    const indexHtml =
      '<script type="module" src="/static/js/index.js"></script><link rel="stylesheet" href="/static/css/index.css">';
    const initialScript = "console.info('boot');".repeat(20);
    const initialStyle = ".app{color:var(--foreground);}".repeat(20);
    const asyncScript = "console.info('async');".repeat(10);

    writeFileSync(indexHtmlPath, indexHtml);
    writeAsset(distDir, "static/js/index.js", initialScript);
    writeAsset(distDir, "static/css/index.css", initialStyle);
    writeAsset(distDir, "static/js/async/feature.js", asyncScript);

    const stats = collectBundleBudgetStats({ distDir, indexHtmlPath });

    expect(stats).toMatchObject({
      initialRaw:
        Buffer.byteLength(initialScript) + Buffer.byteLength(initialStyle),
      initialRequestCount: 2,
      initialScriptRaw: Buffer.byteLength(initialScript),
      totalRaw:
        Buffer.byteLength(initialScript) +
        Buffer.byteLength(initialStyle) +
        Buffer.byteLength(asyncScript) +
        Buffer.byteLength(indexHtml),
    });
    expect(stats).toMatchObject({
      initialScriptBrotli: brotliCompressSync(initialScript).byteLength,
      initialScriptGzip: gzipSync(initialScript).byteLength,
    });
  });
});
