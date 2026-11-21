import { parseArgs } from "node:util";
import {
  DEFAULT_MEMORY_OPTIONS,
  validateMemoryOptions,
} from "./memory-collector";

const INTEGER_PATTERN = /^\d+$/u;
const MEMORY_HELP = `Collect advisory production SPA lifecycle evidence using hermetic fixtures.
No build or server is started. Only an explicit loopback production URL is accepted.
Usage: bun run scripts/run-memory-lifecycle.ts --url URL --build-manifest FILE --output-dir DIR
Options: --warmup 1..100 --samples 4..101 --cycles-per-sample 1..100 --timeout-ms 1000..600000
Build manifest: mode=production, revision=<40 hex>, buildId=<identity>, entrySha256=<64 hex>, assets={<absolute JS/CSS path>:<64 hex>}.
Examples:
  bun run scripts/run-memory-lifecycle.ts --url http://127.0.0.1:4173 --build-manifest /tmp/memory-build.json --output-dir /tmp/memory-evidence
Exit: 0 calibration/advisory growth; 1 invalid collection or failed control; 2 invalid arguments.
Reports contain synthetic fixture metadata/raw counters only. Output must be a new directory; do not publish detailed reports publicly.`;

function integer(value: string | undefined, fallback: number): number {
  if (value === undefined) {
    return fallback;
  }
  if (!INTEGER_PATTERN.test(value)) {
    throw new Error(`Expected a positive integer, received ${value}`);
  }
  return Number(value);
}

export function parseMemoryArguments(args: readonly string[]) {
  const { values } = parseArgs({
    args: [...args],
    strict: true,
    allowPositionals: false,
    options: {
      help: { type: "boolean" },
      url: { type: "string" },
      "build-manifest": { type: "string" },
      "output-dir": { type: "string" },
      warmup: { type: "string" },
      samples: { type: "string" },
      "cycles-per-sample": { type: "string" },
      "timeout-ms": { type: "string" },
    },
  });
  if (values.help === true) {
    return { help: true } as const;
  }
  if (
    values.url === undefined ||
    values["build-manifest"] === undefined ||
    values["output-dir"] === undefined
  ) {
    throw new Error(
      "Required: --url, --build-manifest and --output-dir. Run --help for an example."
    );
  }
  if (
    values.url.trim().length === 0 ||
    values["build-manifest"].trim().length === 0 ||
    values["output-dir"].trim().length === 0
  ) {
    throw new Error("Required CLI values cannot be empty");
  }
  const url = new URL(values.url);
  if (
    !(
      url.protocol === "http:" &&
      ["127.0.0.1", "localhost", "[::1]"].includes(url.hostname)
    ) ||
    url.username ||
    url.password ||
    url.pathname !== "/" ||
    url.search ||
    url.hash
  ) {
    throw new Error(
      "--url must be a credential-free loopback HTTP origin, not a production service or harness path"
    );
  }
  const collection = {
    warmupCycles: integer(values.warmup, DEFAULT_MEMORY_OPTIONS.warmupCycles),
    sampleCount: integer(values.samples, DEFAULT_MEMORY_OPTIONS.sampleCount),
    cyclesPerSample: integer(
      values["cycles-per-sample"],
      DEFAULT_MEMORY_OPTIONS.cyclesPerSample
    ),
    timeoutMs: integer(values["timeout-ms"], DEFAULT_MEMORY_OPTIONS.timeoutMs),
  };
  validateMemoryOptions(collection);
  return {
    help: false,
    url: url.origin,
    buildManifest: values["build-manifest"],
    outputDir: values["output-dir"],
    collection,
  } as const;
}

export { MEMORY_HELP };
