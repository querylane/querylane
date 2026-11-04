import { z } from "zod";
import { MAX_REACT_PROFILE_COMMITS } from "../src/lib/react-profile-recorder";

const timing = z.number().nonnegative();
const reactCommitSchema = z
  .strictObject({
    id: z.literal("application"),
    phase: z.enum(["mount", "update", "nested-update"]),
    actualDuration: timing,
    baseDuration: timing,
    startTime: timing,
    commitTime: timing,
  })
  .refine(
    (commit) => commit.commitTime >= commit.startTime,
    "Commit time precedes render start"
  );
const reactProfileBuildSchema = z.strictObject({
  revision: z.string().regex(/^[a-f\d]{40}$/u),
  sourceDigest: z.string().regex(/^[a-f\d]{64}$/u),
  artifactDigest: z.string().regex(/^[a-f\d]{64}$/u),
  url: z.url(),
  mode: z.literal("react-profile"),
});
const reactProfileEnvironmentSchema = z.strictObject({
  machine: z.string().min(1),
  platform: z.string().min(1),
  browser: z.string().min(1),
  toolchain: z.string().min(1),
  fixtureDigest: z.string().regex(/^[a-f\d]{64}$/u),
  configDigest: z.string().regex(/^[a-f\d]{64}$/u),
  journeyDigest: z.string().regex(/^[a-f\d]{64}$/u),
});
const reactProfileReportSchema = z.strictObject({
  schema: z.literal(1),
  side: z.enum(["base", "head"]),
  pair: z.number().int().nonnegative(),
  order: z.tuple([z.enum(["base", "head"]), z.enum(["base", "head"])]),
  environment: reactProfileEnvironmentSchema,
  protocol: z.literal("react-profile-v1"),
  build: reactProfileBuildSchema,
  journeys: z
    .array(
      z.strictObject({
        id: z.string().min(1),
        warmups: z.literal(1),
        success: z.literal(true),
        commits: z
          .array(reactCommitSchema)
          .min(1)
          .max(MAX_REACT_PROFILE_COMMITS),
      })
    )
    .min(1),
});
type ReactProfileEnvironment = z.infer<typeof reactProfileEnvironmentSchema>;
type ReactProfileReport = z.infer<typeof reactProfileReportSchema>;
type ReactProfileBuild = z.infer<typeof reactProfileBuildSchema>;

// Predeclared, independent of measured data. Advisory evidence, not a production latency budget.
const REACT_PROFILE_POLICY = Object.freeze({
  minimumPairs: 5,
  absoluteMs: 2,
  relativePercent: 20,
  madMultiplier: 3,
  sustainedFraction: 0.8,
});
const PERCENT = 100;
type Verdict = "regression" | "inconclusive" | "no-regression";
function median(values: number[]) {
  const sorted = values.toSorted((a, b) => a - b);
  const middle = Math.floor(sorted.length / 2);
  const upper = sorted[middle];
  const lower = sorted[middle - 1];
  if (upper === undefined) {
    throw new Error("Missing profile observations");
  }
  return sorted.length % 2 === 0 && lower !== undefined
    ? (lower + upper) / 2
    : upper;
}
function total(report: ReactProfileReport, id: string) {
  const journey = report.journeys.find((item) => item.id === id);
  if (!journey) {
    throw new Error(`Missing journey ${id}`);
  }
  const duration = journey.commits.reduce(
    (sum, commit) => sum + commit.actualDuration,
    0
  );
  if (!(duration > 0 && Number.isFinite(duration))) {
    throw new Error(`No nonzero React profile timing for ${id}`);
  }
  return duration;
}
function same(a: unknown, b: unknown) {
  return JSON.stringify(a) === JSON.stringify(b);
}
function coverage(report: ReactProfileReport) {
  const ids = report.journeys.map((journey) => journey.id).toSorted();
  if (new Set(ids).size !== ids.length) {
    throw new Error("Duplicate journey coverage");
  }
  return ids;
}
function validateSample(input: {
  sample: ReactProfileReport;
  index: number;
  first: ReactProfileReport;
  builds: Map<string, ReactProfileBuild>;
  ids: string[];
}) {
  const { sample, index, first, builds, ids } = input;
  const pair = Math.floor(index / 2);
  const order = pair % 2 === 0 ? ["base", "head"] : ["head", "base"];
  if (
    sample.pair !== pair ||
    sample.side !== order[index % 2] ||
    !same(sample.order, order)
  ) {
    throw new Error("Samples must retain alternating matched collection order");
  }
  if (
    !(
      same(sample.environment, first.environment) &&
      same(sample.build, builds.get(sample.side))
    )
  ) {
    throw new Error("Incomparable environment or changed build identity");
  }
  if (!same(coverage(sample), ids)) {
    throw new Error("Changed, new or removed journey coverage");
  }
  for (const id of ids) {
    total(sample, id);
  }
}
function validateSamples(samples: ReactProfileReport[]) {
  const [first, second] = samples;
  if (
    !(first && second) ||
    samples.length < REACT_PROFILE_POLICY.minimumPairs * 2 ||
    samples.length % 2 !== 0
  ) {
    throw new Error("At least five complete alternating pairs required");
  }
  if (first.build.sourceDigest === second.build.sourceDigest) {
    throw new Error("Distinct identified base/head sources required");
  }
  const ids = coverage(first);
  const builds = new Map([
    [first.side, first.build],
    [second.side, second.build],
  ]);
  for (const [index, sample] of samples.entries()) {
    validateSample({ sample, index, first, builds, ids });
  }
  return ids;
}
function pairedDeltas(samples: ReactProfileReport[], id: string) {
  const deltas: number[] = [];
  const percentages: number[] = [];
  for (let index = 0; index < samples.length; index += 2) {
    const a = samples[index];
    const b = samples[index + 1];
    if (!(a && b)) {
      throw new Error("Incomplete pair");
    }
    const base = total(a.side === "base" ? a : b, id);
    const head = total(a.side === "head" ? a : b, id);
    deltas.push(head - base);
    percentages.push(((head - base) / base) * PERCENT);
  }
  return { deltas, percentages };
}
function journeyVerdict(input: {
  sustainedPairs: number;
  pairCount: number;
  medianDeltaMs: number;
  medianPercent: number;
  noiseMs: number;
}): Verdict {
  const { sustainedPairs, pairCount, medianDeltaMs, medianPercent, noiseMs } =
    input;
  const sustained =
    sustainedPairs >=
    Math.ceil(pairCount * REACT_PROFILE_POLICY.sustainedFraction);
  if (
    sustained &&
    medianDeltaMs > Math.max(REACT_PROFILE_POLICY.absoluteMs, noiseMs) &&
    medianPercent > REACT_PROFILE_POLICY.relativePercent
  ) {
    return "regression";
  }
  if (sustainedPairs > 0 || noiseMs > REACT_PROFILE_POLICY.absoluteMs) {
    return "inconclusive";
  }
  return "no-regression";
}
function compareJourney(samples: ReactProfileReport[], id: string) {
  const { deltas, percentages } = pairedDeltas(samples, id);
  const medianDeltaMs = median(deltas);
  const medianPercent = median(percentages);
  const madMs = median(deltas.map((delta) => Math.abs(delta - medianDeltaMs)));
  const noiseMs = REACT_PROFILE_POLICY.madMultiplier * madMs;
  const sustainedPairs = deltas.filter(
    (delta, index) =>
      delta > REACT_PROFILE_POLICY.absoluteMs &&
      (percentages[index] ?? 0) > REACT_PROFILE_POLICY.relativePercent
  ).length;
  const status = journeyVerdict({
    sustainedPairs,
    pairCount: deltas.length,
    medianDeltaMs,
    medianPercent,
    noiseMs,
  });
  return {
    id,
    status,
    medianDeltaMs,
    medianPercent,
    madMs,
    noiseMs,
    sustainedPairs,
    deltasMs: deltas,
    pairedPercent: percentages,
  };
}
function aggregateVerdict(verdicts: Verdict[]): Verdict {
  if (verdicts.includes("regression")) {
    return "regression";
  }
  if (verdicts.includes("inconclusive")) {
    return "inconclusive";
  }
  return "no-regression";
}
function compareReactProfiles(input: unknown, expectedIds: readonly string[]) {
  const samples = z.array(reactProfileReportSchema).parse(input);
  const ids = validateSamples(samples);
  if (!same(ids, expectedIds.toSorted())) {
    throw new Error("Missing or changed required journey coverage");
  }
  const journeys = ids.map((id) => compareJourney(samples, id));
  return {
    status: aggregateVerdict(journeys.map((journey) => journey.status)),
    policy: REACT_PROFILE_POLICY,
    metric:
      "Sum of Profiler actualDuration per semantic journey (ms); not Web Vitals or commit-phase duration",
    journeys,
    samples,
  };
}

export type { ReactProfileBuild, ReactProfileEnvironment, ReactProfileReport };
export {
  compareReactProfiles,
  REACT_PROFILE_POLICY,
  reactCommitSchema,
  reactProfileBuildSchema,
  reactProfileEnvironmentSchema,
  reactProfileReportSchema,
};
