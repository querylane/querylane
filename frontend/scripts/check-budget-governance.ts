import { spawnSync } from "node:child_process";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import process from "node:process";
import { z } from "zod";
import { isNonEmptyString } from "../src/lib/value-guards";

const FRONTEND_ROOT = join(import.meta.dirname, "..");
const BYTES_PER_KIB = 1024;
const POLICY_PATH = "frontend/scripts/bundle-budget-policy.json";
const capSchema = z.record(
  z.string().regex(/^max[A-Za-z]+Bytes$/u),
  z.number().int().positive()
);
const exceptionSchema = z.strictObject({
  cap: z.string(),
  baseRevision: z.string().regex(/^[a-f\d]{40}$/u),
  oldBytes: z.number().int().positive(),
  newBytes: z.number().int().positive(),
  reason: z.string().trim().min(1),
  owner: z.string().regex(/^[a-z\d](?:[a-z\d-]{0,37}[a-z\d])?$/iu),
});
const policySchema = z.strictObject({
  caps: capSchema,
  exceptions: z.array(exceptionSchema),
});

function assertBudgetChanges(
  baseInput: unknown,
  headInput: unknown,
  baseRevision: string
): void {
  const basePolicy = policySchema.parse(baseInput);
  const base = basePolicy.caps;
  const head = policySchema.parse(headInput);
  const historical = new Set(
    basePolicy.exceptions.map((entry) => JSON.stringify(entry))
  );
  const pending = head.exceptions.filter(
    (entry) => !historical.has(JSON.stringify(entry))
  );
  const failures: string[] = [];
  const increases = new Set<string>();
  for (const [cap, oldBytes] of Object.entries(base)) {
    const newBytes = head.caps[cap];
    if (newBytes === undefined) {
      failures.push(`Missing production cap: ${cap}`);
      continue;
    }
    if (newBytes <= oldBytes) {
      continue;
    }
    increases.add(cap);
    const matches = pending.filter(
      (entry) =>
        entry.cap === cap &&
        entry.baseRevision === baseRevision &&
        entry.oldBytes === oldBytes &&
        entry.newBytes === newBytes
    );
    if (matches.length !== 1) {
      failures.push(
        `${cap}: ${oldBytes} -> ${newBytes} requires a matching exception`
      );
    }
  }
  failures.push(
    ...Object.keys(head.caps).flatMap((cap) =>
      cap in base ? [] : [`Unrecognized production cap: ${cap}`]
    ),
    ...exceptionFailures({
      base,
      head: { ...head, exceptions: pending },
      increases,
      baseRevision,
    })
  );
  if (failures.length > 0) {
    throw new Error(`Bundle cap governance failed\n${failures.join("\n")}`);
  }
}

function exceptionFailures({
  base,
  head,
  increases,
  baseRevision,
}: {
  base: Record<string, number>;
  head: z.infer<typeof policySchema>;
  increases: ReadonlySet<string>;
  baseRevision: string;
}): string[] {
  const failures: string[] = [];
  const seen = new Set<string>();
  for (const entry of head.exceptions) {
    if (
      seen.has(entry.cap) ||
      !increases.has(entry.cap) ||
      entry.baseRevision !== baseRevision ||
      entry.oldBytes !== base[entry.cap] ||
      entry.newBytes !== head.caps[entry.cap]
    ) {
      failures.push(`Stale, duplicate or mismatched exception: ${entry.cap}`);
    }
    seen.add(entry.cap);
  }
  return failures;
}

function git(args: string[]): string {
  const result = spawnSync("git", args, {
    cwd: join(FRONTEND_ROOT, ".."),
    encoding: "utf8",
  });
  if (result.status !== 0) {
    throw new Error(
      isNonEmptyString(result.stderr)
        ? result.stderr
        : (result.error?.message ?? "Git budget comparison failed")
    );
  }
  return result.stdout.trim();
}

// One-time migration: old revisions keep their original constants. No fallback
// numeric budgets: an unreadable/missing constant fails closed.
const legacyCaps = {
  maxAsyncScriptGzipBytes: "MAX_ASYNC_SCRIPT_GZIP_KIB",
  maxDeferredChartsGzipBytes: "MAX_DEFERRED_CHARTS_GZIP_KIB",
  maxDeferredSqlEditorGzipBytes: "MAX_DEFERRED_SQL_EDITOR_GZIP_KIB",
  maxDeferredSqlHighlighterGzipBytes: "MAX_DEFERRED_SQL_HIGHLIGHTER_GZIP_KIB",
  maxDeferredVisualizationGzipBytes: "MAX_DEFERRED_VISUALIZATION_GZIP_KIB",
  maxInitialGzipBytes: "MAX_INITIAL_GZIP_KIB",
  maxInitialScriptGzipBytes: "MAX_INITIAL_SCRIPT_GZIP_KIB",
  maxTotalGzipBytes: "MAX_TOTAL_GZIP_KIB",
  maxExplorerColdPayloadGzipBytes: "DATA_EXPLORER_COLD_PAYLOAD_BUDGET_KIB",
};

function readRevisionPolicy(revision: string) {
  const paths = git(["ls-tree", "--name-only", revision, "--", POLICY_PATH]);
  if (paths === POLICY_PATH) {
    return policySchema.parse(
      JSON.parse(git(["show", `${revision}:${POLICY_PATH}`]))
    );
  }
  const bundle = git([
    "show",
    `${revision}:frontend/scripts/check-bundle-budget.ts`,
  ]);
  const perf = git(["show", `${revision}:frontend/scripts/perf-budgets.ts`]);
  const caps = Object.fromEntries(
    Object.entries(legacyCaps).map(([cap, constant]) => {
      const source = cap === "maxExplorerColdPayloadGzipBytes" ? perf : bundle;
      const match = new RegExp(`^const ${constant} = ([\\d_]+);$`, "mu").exec(
        source
      );
      if (!isNonEmptyString(match?.[1])) {
        throw new Error(
          `Cannot read base cap ${constant}; explicit migration required`
        );
      }
      return [cap, Number(match[1].replaceAll("_", "")) * BYTES_PER_KIB];
    })
  );
  return { caps, exceptions: [] };
}

if (import.meta.main) {
  const baseRef = process.argv.at(2);
  if (!isNonEmptyString(baseRef)) {
    throw new Error("Usage: bun run budget:governance <base-revision>");
  }
  const baseRevision = git([
    "rev-parse",
    "--verify",
    "--end-of-options",
    `${baseRef}^{commit}`,
  ]);
  const head: unknown = JSON.parse(
    readFileSync(
      join(FRONTEND_ROOT, "scripts/bundle-budget-policy.json"),
      "utf8"
    )
  );
  assertBudgetChanges(readRevisionPolicy(baseRevision), head, baseRevision);
  console.log(`Bundle cap governance passed against ${baseRevision}`);
}

export { assertBudgetChanges };
