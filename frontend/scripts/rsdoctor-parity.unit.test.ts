import { spawnSync } from "node:child_process";
import { join } from "node:path";
import { expect, test } from "@rstest/core";
import { resolveRsdoctorFeatures } from "./rsdoctor-features";

test("full diagnostic mode retains loader timings", () => {
  expect(resolveRsdoctorFeatures("1").loader).toBe(true);
});

test("bundle attribution preserves ordinary production asset bytes with loaders", () => {
  // Rsdoctor owns native callbacks: exercise its full process lifetime rather
  // than unloading it with a test worker while native work is still finishing.
  const result = spawnSync(
    "bun",
    [join(import.meta.dirname, "verify-rsdoctor-parity.ts")],
    { encoding: "utf8" }
  );
  expect({
    status: result.status,
    error: result.error,
    stderr: result.stderr,
  }).toEqual({ status: 0, error: undefined, stderr: "" });
});
