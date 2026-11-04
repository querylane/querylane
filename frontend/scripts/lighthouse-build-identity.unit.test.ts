import {
  existsSync,
  mkdirSync,
  mkdtempSync,
  rmdirSync,
  rmSync,
  writeFileSync,
} from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { expect, test } from "@rstest/core";
import {
  assertRegularLighthouseBuild,
  lighthouseOutputIdentity,
  prepareLighthouseBuild,
  verifyLighthouseBuild,
} from "./lighthouse-build-identity";

test("source B cannot relabel stale source A assets: collection builds its current source first", () => {
  let assets = "assets-A";
  const identity = prepareLighthouseBuild({
    source: () => "source-B",
    output: () => assets,
    build: () => {
      assets = "assets-B";
    },
  });
  expect(identity).toEqual({ source: "source-B", output: "assets-B" });
});

test("output fingerprints include copied app scripts while excluding retained audit reports", () => {
  const root = mkdtempSync(join(tmpdir(), "querylane-lighthouse-identity-"));
  const reports = join(root, "lighthouse");
  try {
    writeFileSync(
      join(root, "index.html"),
      '<script src="/theme-init.js"></script>'
    );
    writeFileSync(join(root, "theme-init.js"), "theme A");
    mkdirSync(reports);
    writeFileSync(join(reports, "report.html"), "old report");
    const original = lighthouseOutputIdentity(root);
    writeFileSync(join(reports, "report.html"), "new report");
    expect(lighthouseOutputIdentity(root)).toBe(original);
    writeFileSync(join(root, "theme-init.js"), "theme B");
    expect(lighthouseOutputIdentity(root)).not.toBe(original);
  } finally {
    for (const file of [
      "index.html",
      "theme-init.js",
      "lighthouse/report.html",
    ]) {
      rmSync(join(root, file), { force: true });
    }
    if (existsSync(reports)) {
      rmdirSync(reports);
    }
    rmdirSync(root);
  }
});

test("diagnostic and harness builds cannot be labeled ordinary Lighthouse production", () => {
  for (const key of [
    "RSDOCTOR",
    "QUERYLANE_REACT_PROFILE",
    "QUERYLANE_VISUAL_HARNESS",
    "QUERYLANE_REACT_SCAN",
  ]) {
    expect(() => {
      assertRegularLighthouseBuild({ [key]: "1" });
    }).toThrow("ordinary production");
  }
  expect(() => {
    assertRegularLighthouseBuild({});
  }).not.toThrow();
});

test("source drift or failed production builds cannot produce accepted provenance", () => {
  let source = "before";
  expect(() =>
    prepareLighthouseBuild({
      source: () => source,
      output: () => "assets",
      build: () => {
        source = "after";
      },
    })
  ).toThrow("Source changed");
  expect(() =>
    prepareLighthouseBuild({
      source: () => "source",
      output: () => "old-assets",
      build: () => {
        throw new Error("Production cap failed");
      },
    })
  ).toThrow("Production cap failed");
});

test("collection rejects later source/output drift even with complete Lighthouse reports", () => {
  const identity = { source: "source-B", output: "assets-B" };
  expect(() => {
    verifyLighthouseBuild(identity, identity);
  }).not.toThrow();
  expect(() => {
    verifyLighthouseBuild(identity, { ...identity, source: "source-C" });
  }).toThrow();
  expect(() => {
    verifyLighthouseBuild(identity, { ...identity, output: "assets-C" });
  }).toThrow();
});
