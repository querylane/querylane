import { spawnSync } from "node:child_process";
import { mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { expect, test } from "@rstest/core";

test("unavailable baseline is explicit and an existing receipt cannot be reused", () => {
  const directory = mkdtempSync(path.join(tmpdir(), "react-profile-cli-"));
  const input = path.join(directory, "manifest.json");
  const output = path.join(directory, "evidence");
  writeFileSync(
    input,
    JSON.stringify({
      machine: "control",
      configDigest: "c".repeat(64),
      head: {
        mode: "react-profile",
        url: "http://127.0.0.1:4191",
        revision: "a".repeat(40),
        sourceDigest: "b".repeat(64),
        artifactDigest: "d".repeat(64),
      },
    })
  );
  const run = () =>
    spawnSync("bun", ["scripts/react-profile.ts", "collect", input, output], {
      cwd: path.resolve(import.meta.dirname, ".."),
      encoding: "utf8",
    });
  try {
    expect(run().status).toBe(2);
    expect(
      JSON.parse(readFileSync(path.join(output, "comparison.json"), "utf8"))
    ).toMatchObject({ status: "baseline-unavailable" });
    expect(run().status).toBe(1);
  } finally {
    rmSync(directory, { recursive: true, force: true });
  }
});
