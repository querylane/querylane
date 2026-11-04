import { spawnSync } from "node:child_process";
import { mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { env, execPath } from "node:process";
import { expect, test } from "@rstest/core";
import { loadLighthouseReports } from "./lighthouse-summary";
import { classifyAssertions, validateReports } from "./run-lighthouse-evidence";

test("collection URL follows the isolated mock server port instead of another checkout", () => {
  const result = spawnSync(
    execPath,
    ["-e", "console.log(require('./lighthouserc.cjs').ci.collect.url[0])"],
    {
      cwd: join(import.meta.dirname, ".."),
      env: { ...env, PORT: "4201" },
      encoding: "utf8",
    }
  );
  expect(result.status).toBe(0);
  expect(new URL(result.stdout.trim()).port).toBe("4201");
});

test.each(["0", "65536", "4.201e3", "0x1069", "4201junk"])(
  "invalid or nondecimal server ports cannot redirect collection: %s",
  (port) => {
    const result = spawnSync(
      execPath,
      ["-e", "require('./lighthouserc.cjs')"],
      {
        cwd: join(import.meta.dirname, ".."),
        env: { ...env, PORT: port },
        encoding: "utf8",
      }
    );
    expect(result.status).not.toBe(0);
  }
);

test("malformed retained reports fail evidence collection instead of disappearing", () => {
  const directory = mkdtempSync(join(tmpdir(), "querylane-lighthouse-"));
  try {
    writeFileSync(join(directory, "broken.report.json"), "{");
    expect(() => loadLighthouseReports(directory)).toThrow();
  } finally {
    rmSync(directory, { force: true, recursive: true });
  }
});

test("distinguishes failed thresholds from assertion-command failures", () => {
  expect(classifyAssertions(1, [{ passed: false, level: "error" }])).toBe(
    "thresholds-failed"
  );
});

test.each([
  { exit: 1, results: [] },
  { exit: 1, results: [{ passed: true, level: "error" }] },
  { exit: 0, results: [{ passed: false, level: "error" }] },
  { exit: 2, results: [{ passed: false, level: "error" }] },
  { exit: null, results: [{ passed: false, level: "error" }] },
  { exit: 1, results: [{ passed: "false", level: "error" }] },
])(
  "assertion process errors are fatal, not advisory: %j",
  ({ exit, results }) => {
    expect(() => classifyAssertions(exit, results)).toThrow();
  }
);

test("passing assertions remain passing evidence", () => {
  expect(classifyAssertions(0, [])).toBe("passed");
  expect(classifyAssertions(0, [{ passed: true, level: "error" }])).toBe(
    "passed"
  );
});

const fixtureUrl =
  "http://localhost:4173/instances/production/databases/appdb/explorer?category=tables&name=orders&schema=public";
const retainedReport = {
  requestedUrl: fixtureUrl,
  finalUrl: fixtureUrl,
  lighthouseVersion: "12.6.1",
  environment: { hostUserAgent: "HeadlessChrome/test" },
  configSettings: { formFactor: "desktop" },
  categories: {
    performance: { score: 0.9 },
    accessibility: { score: 1 },
    "best-practices": { score: 1 },
    seo: { score: 1 },
  },
};

test("retained evidence must contain every fixture run and browser/config metadata", () => {
  expect(validateReports([retainedReport], [fixtureUrl], 1)).toHaveLength(1);
  expect(() => validateReports([], [fixtureUrl], 1)).toThrow("Expected 1");
  expect(() => validateReports([retainedReport], [fixtureUrl], 3)).toThrow(
    "Expected 3"
  );
  expect(() =>
    validateReports(
      [{ ...retainedReport, finalUrl: "http://localhost:4173/" }],
      [fixtureUrl],
      1
    )
  ).toThrow("Missing fixture-route");
  for (const invalid of [
    { ...retainedReport, runtimeError: { code: "NO_FCP" } },
    { ...retainedReport, categories: {} },
    { ...retainedReport, environment: {} },
  ]) {
    expect(() => validateReports([invalid], [fixtureUrl], 1)).toThrow();
  }
});
