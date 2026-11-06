import { expect, test } from "@rstest/core";
import { analyzeMemory, type MemorySample } from "./memory-detector";

function samples(values: readonly number[]): MemorySample[] {
  return values.map((value, cycle) => ({
    cycle,
    documentId: "fixed-document",
    elapsedMs: cycle * 10,
    heapBytes: value * 100,
    nodes: value,
    listeners: value,
    documents: 1,
    dedicatedWorkers: 0,
  }));
}

test("reports sustained growth, not a leak verdict or a blocking budget", () => {
  const result = analyzeMemory(samples([100, 120, 140, 160]));
  expect(result.status).toBe("suspected-growth");
  expect(result.blocking).toBe(false);
  expect(result.metrics.nodes).toEqual({
    count: 4,
    min: 100,
    max: 160,
    spread: 60,
    delta: 60,
    medianSlopePerCycle: 20,
    sustainedGrowth: true,
  });
});

test("flat and independently noisy literal data remain calibration-only", () => {
  for (const values of [
    [100, 100, 100, 100],
    [100, 102, 99, 101],
  ]) {
    expect(analyzeMemory(samples(values)).status).toBe("calibration-only");
  }
});

test("missing, nonfinite, duplicate, incomplete and reloaded collections fail honestly", () => {
  const valid = samples([100, 100, 100, 100]);
  const missing = valid.map((sample) => ({ ...sample, heapBytes: null }));
  const reloaded = valid.map((sample, index) => ({
    ...sample,
    documentId: index === 2 ? "new-document" : "fixed-document",
  }));
  const nonfinite = valid.map((sample) => ({ ...sample, nodes: Number.NaN }));
  const duplicate = valid.map((sample) => ({ ...sample, cycle: 0 }));
  for (const input of [
    [],
    valid.slice(0, 3),
    samples(Array.from({ length: 102 }, () => 100)),
    missing,
    reloaded,
    nonfinite,
    duplicate,
  ]) {
    expect(analyzeMemory(input).status).toBe("invalid-collection");
    expect(analyzeMemory(input).blocking).toBe(true);
  }
  expect(analyzeMemory(valid, { errors: ["readiness failed"] }).status).toBe(
    "invalid-collection"
  );
  expect(analyzeMemory(valid, { expectedSamples: 5 }).status).toBe(
    "invalid-collection"
  );
});

test("failed sensitivity controls are distinct from calibration and collection failure", () => {
  const flat = samples([100, 100, 100, 100]);
  expect(analyzeMemory(flat, { control: "retained-dom" }).status).toBe(
    "negative-control-failed"
  );
  expect(
    analyzeMemory(samples([100, 120, 140, 160]), { control: "retained-dom" })
      .status
  ).toBe("suspected-growth");
  expect(analyzeMemory(flat, { control: "released-dom" }).status).toBe(
    "calibration-only"
  );
  expect(
    analyzeMemory(samples([100, 120, 140, 160]), { control: "released-dom" })
      .status
  ).toBe("negative-control-failed");
});
