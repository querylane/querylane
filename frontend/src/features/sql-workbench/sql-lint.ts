import { type Diagnostic, linter, lintKeymap } from "@codemirror/lint";
import type { Extension } from "@codemirror/state";
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

/** Memoizes validator results by statement text. */
class ProblemCache {
  private readonly results = new Map<string, SqlProblem | null>();

  async lookup(
    statement: string,
    validator: SqlValidator,
    signal: AbortSignal
  ): Promise<SqlProblem | null> {
    const cached = this.results.get(statement);
    if (cached !== undefined) {
      return cached;
    }
    const problem = await validator(statement, signal);
    if (signal.aborted) {
      return null;
    }
    if (this.results.size >= RESULT_CACHE_LIMIT) {
      this.results.clear();
    }
    this.results.set(statement, problem);
    return problem;
  }
}

/**
 * Lints every statement in the document through the validator, one server
 * round trip per statement not seen before. A new lint run aborts the
 * previous one so a fast typist never queues stale checks.
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
    const problems = await Promise.all(
      statements.map((statement) =>
        cache.lookup(statement.text, validator, controller.signal)
      )
    );
    if (controller.signal.aborted) {
      return [];
    }
    return statements.flatMap((statement, index) => {
      const problem = problems[index];
      return problem ? [toDiagnostic(statement, problem)] : [];
    });
  }

  return [linter(lint, { delay: LINT_DELAY_MS }), keymap.of(lintKeymap)];
}

export { sqlLinter };
