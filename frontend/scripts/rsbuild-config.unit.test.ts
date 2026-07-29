import path from "node:path";
import { createRsbuild, loadConfig } from "@rsbuild/core";
import { RsdoctorRspackPlugin } from "@rsdoctor/rspack-plugin";
import { describe, expect, test, vi } from "vitest";

const frontendRoot = path.resolve(import.meta.dirname, "..");

async function createLoadedRsbuild() {
  const loadedConfig = await loadConfig({
    command: "build",
    cwd: frontendRoot,
    envMode: "production",
  });

  return createRsbuild({ config: loadedConfig, cwd: frontendRoot });
}

describe("Rsbuild config loading", () => {
  test("tracks imported config files for cache invalidation and restarts", async () => {
    const rsbuild = await createLoadedRsbuild();

    expect(rsbuild.context.configFile).toBe(
      path.join(frontendRoot, "rsbuild.config.ts")
    );
    expect(rsbuild.context.configFileDependencies).toEqual(
      expect.arrayContaining([
        path.join(frontendRoot, "rsbuild.performance.ts"),
        path.join(frontendRoot, "scripts/react-performance-mode.ts"),
      ])
    );
  });

  test("emits standalone Rsdoctor HTML and JSON reports", async () => {
    vi.stubEnv("RSDOCTOR", "1");

    try {
      const rsbuild = await createLoadedRsbuild();
      const rspackConfigs = await rsbuild.initConfigs({ action: "build" });
      const rsdoctorPlugin = rspackConfigs
        .flatMap((config) => config.plugins ?? [])
        .find((plugin) => plugin instanceof RsdoctorRspackPlugin);

      if (!(rsdoctorPlugin instanceof RsdoctorRspackPlugin)) {
        throw new Error("Rsdoctor plugin was not registered");
      }

      expect(rsdoctorPlugin.options.output.options.type).toEqual([
        "html",
        "json",
      ]);
    } finally {
      vi.unstubAllEnvs();
    }
  });
});
