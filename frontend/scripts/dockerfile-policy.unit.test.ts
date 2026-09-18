import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, test } from "@rstest/core";

const dockerfile = readFileSync(
  resolve(import.meta.dirname, "../../Dockerfile"),
  "utf8"
);

describe("frontend Docker install", () => {
  test("copies scoped registry configuration before frozen install", () => {
    const registryConfigCopy = dockerfile.indexOf("COPY frontend/.npmrc ./");
    const frozenInstall = dockerfile.indexOf(
      "bun install --frozen-lockfile --ignore-scripts"
    );

    expect(registryConfigCopy).toBeGreaterThanOrEqual(0);
    expect(frozenInstall).toBeGreaterThan(registryConfigCopy);
  });
});
