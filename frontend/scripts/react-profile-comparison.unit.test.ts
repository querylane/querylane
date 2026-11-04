import { expect, test } from "@rstest/core";
import { compareReactProfiles as compare } from "./react-profile-comparison";

const compareReactProfiles = (input: unknown) =>
  compare(input, ["explorer-selection-filter:v1"]);

function report(side: "base" | "head", pair: number, duration: number) {
  return {
    schema: 1,
    side,
    pair,
    order: pair % 2 === 0 ? ["base", "head"] : ["head", "base"],
    environment: {
      machine: "host",
      platform: "os/cpu",
      browser: "chromium-version",
      toolchain: "installed-lock-digest",
      fixtureDigest: "1".repeat(64),
      configDigest: "2".repeat(64),
      journeyDigest: "3".repeat(64),
    },
    protocol: "react-profile-v1",
    build: {
      revision: (side === "base" ? "a" : "b").repeat(40),
      sourceDigest: (side === "base" ? "c" : "d").repeat(64),
      artifactDigest: (side === "base" ? "e" : "f").repeat(64),
      url: `http://127.0.0.1:${side === "base" ? "4101" : "4102"}`,
      mode: "react-profile",
    },
    journeys: [
      {
        id: "explorer-selection-filter:v1",
        warmups: 1,
        success: true,
        commits: [
          {
            id: "application",
            phase: "update",
            actualDuration: duration,
            baseDuration: duration,
            startTime: 1,
            commitTime: 2,
          },
        ],
      },
    ],
  };
}

function pairs(deltas: number[]) {
  return deltas.flatMap((delta, pair) =>
    pair % 2 === 0
      ? [report("base", pair, 10), report("head", pair, 10 + delta)]
      : [report("head", pair, 10 + delta), report("base", pair, 10)]
  );
}

test("sustained paired slowdown fails against predeclared thresholds", () => {
  const result = compareReactProfiles(pairs([5, 5, 5, 5, 5]));
  expect(result.status).toBe("regression");
  expect(result.journeys[0]).toMatchObject({
    medianDeltaMs: 5,
    medianPercent: 50,
    madMs: 0,
    sustainedPairs: 5,
  });
});

test("one outlier is inconclusive, not a sustained regression or clean pass", () => {
  expect(compareReactProfiles(pairs([0, 0, 50, 0, 0])).status).toBe(
    "inconclusive"
  );
});

test("stable pairs retain raw samples and report no detected regression", () => {
  const input = pairs([0, 0, 0, 0, 0]);
  const result = compareReactProfiles(input);
  expect(result.status).toBe("no-regression");
  expect(result.samples).toEqual(input);
});

test.each([
  ["fewer than five pairs", () => pairs([5, 5, 5, 5])],
  [
    "missing journey",
    () =>
      pairs([5, 5, 5, 5, 5]).map((r, i) =>
        i === 1 ? { ...r, journeys: [] } : r
      ),
  ],
  [
    "new journey",
    () =>
      pairs([5, 5, 5, 5, 5]).map((r, i) =>
        i === 1 ? { ...r, journeys: [{ ...r.journeys[0], id: "new:v1" }] } : r
      ),
  ],
  [
    "no callbacks",
    () =>
      pairs([5, 5, 5, 5, 5]).map((r, i) =>
        i === 1
          ? { ...r, journeys: r.journeys.map((j) => ({ ...j, commits: [] })) }
          : r
      ),
  ],
  ["zero instrumentation", () => pairs([-10, -10, -10, -10, -10])],
  [
    "changed environment",
    () =>
      pairs([5, 5, 5, 5, 5]).map((r, i) =>
        i === 1
          ? { ...r, environment: { ...r.environment, machine: "other" } }
          : r
      ),
  ],
  [
    "changed build",
    () =>
      pairs([5, 5, 5, 5, 5]).map((r, i) =>
        i === 1
          ? { ...r, build: { ...r.build, artifactDigest: "1".repeat(64) } }
          : r
      ),
  ],
  ["wrong alternating order", () => pairs([5, 5, 5, 5, 5]).toReversed()],
  [
    "duplicate pair",
    () => pairs([5, 5, 5, 5, 5]).map((r) => ({ ...r, pair: 0 })),
  ],
  [
    "unsuccessful journey",
    () =>
      pairs([5, 5, 5, 5, 5]).map((r, i) =>
        i === 1
          ? {
              ...r,
              journeys: r.journeys.map((j) => ({ ...j, success: false })),
            }
          : r
      ),
  ],
])("rejects invalid evidence: %s", (_name, input) => {
  expect(() => compareReactProfiles(input())).toThrow();
});

test("cannot silently drop a journey from both cohorts", () => {
  expect(() =>
    compare(pairs([0, 0, 0, 0, 0]), [
      "explorer-selection-filter:v1",
      "metrics-range-change:v1",
    ])
  ).toThrow("required journey coverage");
});

test("rejects overflow rather than classifying nonfinite totals as quiet", () => {
  const samples = pairs([0, 0, 0, 0, 0]).map((sample) => ({
    ...sample,
    journeys: sample.journeys.map((journey) => ({
      ...journey,
      commits: [
        { ...journey.commits[0], actualDuration: Number.MAX_VALUE },
        { ...journey.commits[0], actualDuration: Number.MAX_VALUE },
      ],
    })),
  }));
  expect(() => compareReactProfiles(samples)).toThrow();
});

test("identifies an uncommitted head by snapshot digest without inventing a revision", () => {
  const samples = pairs([0, 0, 0, 0, 0]).map((sample) => ({
    ...sample,
    build: { ...sample.build, revision: "a".repeat(40) },
  }));
  expect(compareReactProfiles(samples).status).toBe("no-regression");
});

test("head-only calibration cannot masquerade as distinct sources", () => {
  const samples = pairs([0, 0, 0, 0, 0]).map((sample) => ({
    ...sample,
    build: { ...sample.build, sourceDigest: "a".repeat(64) },
  }));
  expect(() => compareReactProfiles(samples)).toThrow(
    "Distinct identified base/head sources"
  );
});
