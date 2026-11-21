import { expect, test } from "@rstest/core";
import { memoryBuildSchema, memorySha256 } from "./memory-build";

test("build identity accepts the copied theme initializer but rejects undeclared root scripts and unsafe paths", () => {
  const build = {
    mode: "production",
    revision: "1".repeat(40),
    buildId: "copied-initializer-contract",
    entrySha256: memorySha256("entry"),
    assets: {
      "/theme-init.js": memorySha256("theme"),
      "/static/js/main.fixture.js": memorySha256("app"),
    },
  };
  expect(memoryBuildSchema.parse(build).assets).toEqual(build.assets);
  for (const path of [
    "/unknown.js",
    "/theme-init.js?modified=1",
    "/static/../theme-init.js",
    "https://example.com/theme-init.js",
  ]) {
    expect(
      memoryBuildSchema.safeParse({
        ...build,
        assets: { [path]: memorySha256("unexpected") },
      }).success
    ).toBe(false);
  }
});
