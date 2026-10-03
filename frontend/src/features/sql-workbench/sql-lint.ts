import { type Diagnostic, linter, lintKeymap } from "@codemirror/lint";
import { type Extension, StateEffect } from "@codemirror/state";
import { type EditorView, keymap } from "@codemirror/view";
import {
  problemRange,
  type SqlProblem,
} from "@/features/sql-workbench/sql-diagnostics";
import {
  type SqlStatement,
  splitSqlStatements,
} from "@/features/sql-workbench/sql-statements";
import type { SqlValidator } from "@/features/sql-workbench/use-sql-validation";

// Wait for a pause in typing before asking the server; a check costs a
// round trip and a pooled connection.
const LINT_DELAY_MS = 600;
// Results are memoized by statement text so re-linting after an edit to one
// statement never re-checks the untouched ones.
const RESULT_CACHE_LIMIT = 200;
const MAX_CONCURRENT_CHECKS = 2;

function renderProblem(problem: SqlProblem): Node {
  const root = document.createElement("div");
  const message = document.createElement("div");
  message.textContent = problem.message;
  root.append(message);
  for (const extra of [problem.detail, problem.hint]) {
    if (extra) {
      const line = document.createElement("div");
      line.className = "cm-sqlDiagnosticExtra";
      line.textContent = extra;
      root.append(line);
    }
  }
  return root;
}

function toDiagnostic(
  statement: SqlStatement,
  problem: SqlProblem
): Diagnostic {
  const range = problemRange(statement, problem);
  return {
    from: range.from,
    message: problem.message,
    renderMessage: () => renderProblem(problem),
    severity: "error",
    to: range.to,
  };
}

/**
 * Memoizes validator results by statement text within the validator's scope
 * (its default schema): the same text can resolve differently per schema.
 * Failed checks (`undefined`) are not stored, so they are retried.
 */
class ProblemCache {
  private readonly results = new Map<string, SqlProblem | null>();

  async lookup(
    statement: string,
    validator: SqlValidator,
    signal: AbortSignal
  ): Promise<SqlProblem | null | undefined> {
    const key = `${validator.scopeKey}\u0000${statement}`;
    const cached = this.results.get(key);
    if (cached !== undefined) {
      return cached;
    }
    const problem = await validator.check(statement, signal);
    if (signal.aborted || problem === undefined) {
      return;
    }
    if (this.results.size >= RESULT_CACHE_LIMIT) {
      this.results.clear();
    }
    this.results.set(key, problem);
    return problem;
  }
}

/**
 * Runs `task` for every item with at most `limit` in flight. Validation
 * shares the per-instance RPC cap with Run and Explain, so a long script must
 * not flood it.
 */
async function mapWithConcurrency<T, R>(
  items: readonly T[],
  limit: number,
  task: (item: T) => Promise<R>
): Promise<R[]> {
  const results = new Array<R>(items.length);
  // One iterator shared by every worker: each step takes the next unclaimed
  // item, so no item runs twice.
  const pending = items.entries();
  async function worker(): Promise<void> {
    const next = pending.next();
    if (next.done) {
      return;
    }
    const [index, item] = next.value;
    results[index] = await task(item);
    return worker();
  }
  await Promise.all(
    Array.from({ length: Math.min(limit, items.length) }, () => worker())
  );
  return results;
}

/**
 * Re-checks the document without an edit, e.g. after the default schema
 * changed and the same text now resolves differently. (`forceLinting` only
 * hurries a run that an edit already scheduled.)
 */
const refreshSqlLint = StateEffect.define<null>();

/**
 * Lints every statement in the document through the validator, one server
 * round trip per statement not seen before (at most
 * `MAX_CONCURRENT_CHECKS` at a time). A new lint run aborts the previous one
 * so a fast typist never queues stale checks.
 */
function sqlLinter(getValidator: () => SqlValidator | undefined): Extension {
  const cache = new ProblemCache();
  let inFlight: AbortController | null = null;

  async function lint(view: EditorView): Promise<Diagnostic[]> {
    const validator = getValidator();
    if (!validator) {
      return [];
    }
    inFlight?.abort();
    const controller = new AbortController();
    inFlight = controller;
    const statements = splitSqlStatements(view.state.doc.toString());
    const problems = await mapWithConcurrency(
      statements,
      MAX_CONCURRENT_CHECKS,
      (statement) =>
        controller.signal.aborted
          ? Promise.resolve(undefined)
          : cache.lookup(statement.text, validator, controller.signal)
    );
    if (controller.signal.aborted) {
      return [];
    }
    return statements.flatMap((statement, index) => {
      const problem = problems[index];
      return problem ? [toDiagnostic(statement, problem)] : [];
    });
  }

  return [
    linter(lint, {
      delay: LINT_DELAY_MS,
      needsRefresh: (update) =>
        update.transactions.some((transaction) =>
          transaction.effects.some((effect) => effect.is(refreshSqlLint))
        ),
    }),
    keymap.of(lintKeymap),
  ];
}

export { mapWithConcurrency, ProblemCache, refreshSqlLint, sqlLinter };
