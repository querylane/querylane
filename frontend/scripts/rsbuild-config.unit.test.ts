import path from "node:path";
import { createRsbuild, loadConfig } from "@rsbuild/core";
import { describe, expect, rs, test } from "@rstest/core";

const frontendRoot = path.resolve(import.meta.dirname, "..");

async function createLoadedRsbuild(action: "build" | "dev" = "build") {
  const loadedConfig = await loadConfig({
    command: action,
    cwd: frontendRoot,
    envMode: action === "build" ? "production" : "development",
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

  test("pins supported experiments and excludes unused ones in development", async () => {
    const rsbuild = await createLoadedRsbuild("dev");
    const [rspackConfig] = await rsbuild.initConfigs({ action: "dev" });

    expect(rspackConfig?.experiments).toMatchObject({
      asyncWebAssembly: true,
      futureDefaults: true,
      nativeWatcher: true,
      pureFunctions: false,
      sourceImport: true,
    });
    expect(rspackConfig?.experiments?.buildHttp).toBeUndefined();
    expect(rspackConfig?.experiments?.deferImport).not.toBe(true);
    expect(rspackConfig?.experiments?.runtimeMode).not.toBe("rspack");
    expect(rspackConfig?.experiments?.useInputFileSystem).toBeFalsy();
  });

  test("pins production experiments and compact IDs without losing managed chunking", async () => {
    rs.stubEnv("NODE_ENV", "production");

    try {
      const rsbuild = await createLoadedRsbuild();
      const [rspackConfig] = await rsbuild.initConfigs({ action: "build" });

      expect(rspackConfig).toBeDefined();
      expect(rspackConfig?.experiments).toMatchObject({
        asyncWebAssembly: true,
        futureDefaults: true,
        pureFunctions: true,
        sourceImport: true,
      });
      expect(rspackConfig?.optimization).toMatchObject({
        chunkIds: "compat-hashed",
        moduleIds: "compat-hashed",
        splitChunks: {
          chunks: "all",
          maxAsyncRequests: 30,
          maxInitialRequests: 20,
          minSize: 20 * 1024,
        },
      });
    } finally {
      rs.unstubAllEnvs();
    }
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
