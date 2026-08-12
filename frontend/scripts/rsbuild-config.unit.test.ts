import path from "node:path";
import { createRsbuild, loadConfig } from "@rsbuild/core";
import { describe, expect, rs, test } from "@rstest/core";

const frontendRoot = path.resolve(import.meta.dirname, "..");

async function createLoadedRsbuild() {
  const loadedConfig = await loadConfig({
    command: "build",
    cwd: frontendRoot,
    envMode: "production",
  });

  return createRsbuild({ config: loadedConfig, cwd: frontendRoot });
}

function isRsdoctorPlugin(
  value: unknown
): value is { name: "RsdoctorRspackPlugin"; options: object } {
  return (
    typeof value === "object" &&
    value !== null &&
    "name" in value &&
    value.name === "RsdoctorRspackPlugin" &&
    "options" in value &&
    typeof value.options === "object" &&
    value.options !== null
  );
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
    rs.stubEnv("RSDOCTOR", "1");

    try {
      const rsbuild = await createLoadedRsbuild();
      const rspackConfigs = await rsbuild.initConfigs({ action: "build" });
      const rspackPlugins: unknown[] = rspackConfigs.flatMap(
        (config) => config.plugins ?? []
      );
      const rsdoctorPlugin = rspackPlugins.find(isRsdoctorPlugin);

      if (!rsdoctorPlugin) {
        throw new Error("Rsdoctor plugin was not registered");
      }

      expect(rsdoctorPlugin.options).toMatchObject({
        output: { options: { type: ["html", "json"] } },
      });
    } finally {
      rs.unstubAllEnvs();
    }
  });
});
