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

const LINT_DELAY_MS = 600;
const RESULT_CACHE_LIMIT = 200;
const MAX_CONCURRENT_CHECKS = 2;

function renderProblem(problem: SqlProblem) {
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

function toDiagnostic(statement: SqlStatement, problem: SqlProblem) {
  const range = problemRange(statement, problem);
  return {
    from: range.from,
    message: problem.message,
    renderMessage: () => renderProblem(problem),
    severity: "error",
    to: range.to,
  } satisfies Diagnostic;
}

class ScopedSqlProblemCache {
  private readonly results = new Map<string, SqlProblem | null>();

  async lookup(
    statement: string,
    validator: SqlValidator,
    signal: AbortSignal
  ) {
    const key = `${validator.scopeKey}\u0000${statement}`;
    const cached = this.results.get(key);
    if (cached !== undefined) {
      return cached;
    }
    const problem = await validator.check(statement, signal);
    if (signal.aborted || problem === undefined) {
      return undefined;
    }
    if (this.results.size >= RESULT_CACHE_LIMIT) {
      this.results.clear();
    }
    this.results.set(key, problem);
    return problem;
  }
}

async function mapWithConcurrency<T, R>(
  items: readonly T[],
  limit: number,
  task: (item: T) => Promise<R>
) {
  const results: R[] = [];
  const pending = items.entries();
  async function worker() {
    const next = pending.next();
    if (next.done === true) {
      return;
    }
    const [index, item] = next.value;
    results[index] = await task(item);
    await worker();
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
const refreshSqlLint = StateEffect.define();

/**
 * Lints every statement in the document through the validator, one server
 * round trip per statement not seen before (at most
 * `MAX_CONCURRENT_CHECKS` at a time). A new lint run aborts the previous one
 * so a fast typist never queues stale checks.
 */
function sqlLinter(getValidator: () => SqlValidator | undefined) {
  const cache = new ScopedSqlProblemCache();
  let inFlight: AbortController | null = null;

  async function lint(view: EditorView) {
    const validator = getValidator();
    if (!validator) {
      return [] satisfies Diagnostic[];
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
      return [] satisfies Diagnostic[];
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
  ] satisfies Extension;
}

export { refreshSqlLint, sqlLinter };
