import { expect, test } from "@rstest/core";
import { parseMemoryArguments } from "./memory-options";

const REQUIRED = [
  "--url",
  "http://127.0.0.1:4173",
  "--build-manifest",
  "/tmp/build.json",
  "--output-dir",
  "/tmp/evidence",
];

test("cli requires explicit identity and bounds all lifecycle parameters", () => {
  expect(parseMemoryArguments(REQUIRED)).toMatchObject({
    help: false,
    url: "http://127.0.0.1:4173",
    collection: {
      warmupCycles: 5,
      sampleCount: 6,
      cyclesPerSample: 5,
      timeoutMs: 180_000,
    },
  });
  expect(parseMemoryArguments(["--help"])).toEqual({ help: true });
  for (const args of [
    [],
    ["--unknown"],
    [...REQUIRED, "--samples", "3"],
    [...REQUIRED, "--samples", "102"],
    [...REQUIRED, "--warmup", "0"],
    [...REQUIRED, "--warmup", "1.2"],
    [...REQUIRED, "--cycles-per-sample", "0"],
    [...REQUIRED, "--timeout-ms", "600001"],
    [...REQUIRED, "--samples", "101", "--cycles-per-sample", "100"],
  ]) {
    expect(() => parseMemoryArguments(args)).toThrow();
  }
});

test("cli never accepts credentialed, external, file, or harness URLs", () => {
  for (const url of [
    "https://example.org",
    "http://127.0.0.1.evil.test",
    "http://user:password@localhost",
    "file:///tmp/index.html",
    "http://localhost/visual-harness",
    "http://localhost/?secret=x",
  ]) {
    expect(() =>
      parseMemoryArguments(["--url", url, ...REQUIRED.slice(2)])
    ).toThrow();
  }
});
