import { argv } from "node:process";
import { isRecord } from "../src/lib/value-guards";

const REQUIRED_JOBS = [
  "static",
  "unit",
  "integration",
  "browser",
  "e2e",
  "visual",
  "build",
];

function frontendChanged(changes: unknown): boolean {
  if (!isRecord(changes)) {
    throw new Error("Missing frontend change detection");
  }
  const { result, outputs } = changes;
  if (!(result === "success" && isRecord(outputs))) {
    throw new Error("Frontend change detection did not succeed");
  }
  const { frontend } = outputs;
  if (frontend !== "true" && frontend !== "false") {
    throw new Error("Frontend change detection returned an invalid decision");
  }
  return frontend === "true";
}

function assertFrontendCiGate(input: unknown): void {
  if (!isRecord(input)) {
    throw new Error("Missing frontend CI results");
  }
  const { changes } = input;
  const requiredResult = frontendChanged(changes) ? "success" : "skipped";
  for (const name of REQUIRED_JOBS) {
    const job = input[name];
    if (!isRecord(job)) {
      throw new Error(`Missing frontend ${name} result`);
    }
    const { result } = job;
    if (result !== requiredResult) {
      throw new Error(`Frontend ${name} must be ${requiredResult}`);
    }
  }
}

if (import.meta.main) {
  const results: unknown = JSON.parse(argv.at(2) ?? "null");
  assertFrontendCiGate(results);
  console.log("Frontend quality gate passed");
}

export { assertFrontendCiGate };
