import { deepStrictEqual } from "node:assert/strict";
import {
  mkdtempSync,
  readdirSync,
  readFileSync,
  rmSync,
  writeFileSync,
} from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { createRsbuild } from "@rsbuild/core";
import { RsdoctorRspackPlugin } from "@rsdoctor/core";
import { productionOptimizationOverrides } from "../rsbuild.performance";
import { resolveRsdoctorFeatures } from "./rsdoctor-features";

const SCRIPT = /\.js$/u;
const ASSET = /\.(?:js|css|html)$/u;

// A real loader participates in Rspack's module identity, as Tailwind does in
// the application. Compare emitted bytes, not a normalized stats representation.
async function verifyRsdoctorParity() {
  const cwd = mkdtempSync(join(tmpdir(), "querylane-parity-"));
  writeFileSync(
    join(cwd, "entry.js"),
    'globalThis.loadPage = () => import("./page.js");'
  );
  writeFileSync(join(cwd, "page.js"), 'export const title = "Querylane";');
  writeFileSync(
    join(cwd, "identity.cjs"),
    "module.exports = function(source) { return source; };"
  );
  async function build(profile: boolean) {
    const rsbuild = await createRsbuild({
      cwd,
      rsbuildConfig: {
        logLevel: "error",
        output: { sourceMap: { js: false } },
        performance: { buildCache: false, printFileSize: false },
        source: { entry: { index: "./entry.js" } },
        tools: {
          rspack: {
            optimization: productionOptimizationOverrides,
            module: {
              rules: [{ test: SCRIPT, use: [join(cwd, "identity.cjs")] }],
            },
            plugins: profile
              ? [
                  new RsdoctorRspackPlugin({
                    disableClientServer: true,
                    features: resolveRsdoctorFeatures("bundle"),
                    output: { mode: "brief", options: { type: ["json"] } },
                  }),
                ]
              : [],
          },
        },
      },
    });
    const result = await rsbuild.build();
    try {
      const dist = join(cwd, "dist");
      return Object.fromEntries(
        readdirSync(dist, { recursive: true, encoding: "utf8" })
          .filter((file) => ASSET.test(file))
          .toSorted()
          .map((file) => [file, readFileSync(join(dist, file), "utf8")])
      );
    } finally {
      await result.close();
    }
  }
  try {
    const ordinary = await build(false);
    deepStrictEqual(await build(true), ordinary);
  } finally {
    rmSync(cwd, { recursive: true, force: true });
  }
}

if (import.meta.main) {
  await verifyRsdoctorParity();
}
