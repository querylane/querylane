import { afterEach } from "vitest";

type UnexpectedConsoleIssueLevel = "error" | "warn";

interface UnexpectedConsoleIssue {
  args: readonly unknown[];
  level: UnexpectedConsoleIssueLevel;
}

interface ConsoleIssueGuardState {
  afterEachInstalled: boolean;
  installed: boolean;
  issues: UnexpectedConsoleIssue[];
  originalError: Console["error"];
  originalWarn: Console["warn"];
}

const stateKey = Symbol.for("querylane.test.console-issue-guard");

function isConsoleIssueGuardState(
  value: unknown
): value is ConsoleIssueGuardState {
  return (
    typeof value === "object" &&
    value !== null &&
    "afterEachInstalled" in value &&
    "installed" in value &&
    "issues" in value &&
    "originalError" in value &&
    "originalWarn" in value
  );
}

function getConsoleIssueGuardState(): ConsoleIssueGuardState {
  const existingState = Reflect.get(globalThis, stateKey);
  if (isConsoleIssueGuardState(existingState)) {
    return existingState;
  }

  const testConsole = getTestConsole();
  const state: ConsoleIssueGuardState = {
    afterEachInstalled: false,
    installed: false,
    issues: [],
    originalError: testConsole.error.bind(testConsole),
    originalWarn: testConsole.warn.bind(testConsole),
  };
  Reflect.set(globalThis, stateKey, state);
  return state;
}

function getTestConsole(): Console {
  const testConsole = Reflect.get(globalThis, "console");
  if (
    typeof testConsole === "object" &&
    testConsole !== null &&
    "error" in testConsole &&
    "warn" in testConsole
  ) {
    return testConsole as Console;
  }

  throw new Error("Expected global console to be available in Vitest.");
}

function formatConsoleArgument(argument: unknown): string {
  if (argument instanceof Error) {
    return argument.stack ?? `${argument.name}: ${argument.message}`;
  }

  if (typeof argument === "string") {
    return argument;
  }

  const serialized = JSON.stringify(argument);
  return serialized ?? String(argument);
}

function formatUnexpectedConsoleIssues(
  issues: readonly UnexpectedConsoleIssue[]
) {
  const formattedIssues = issues.map(
    ({ args, level }) =>
      `console.${level}: ${args.map(formatConsoleArgument).join(" ")}`
  );

  return [
    "Unexpected console output during Vitest run.",
    "Mock console.warn or console.error in the specific test only when that console output is the behavior under test.",
    ...formattedIssues,
  ].join("\n");
}

function installUnexpectedConsoleIssueGuard() {
  const state = getConsoleIssueGuardState();

  if (!state.installed) {
    const testConsole = getTestConsole();
    testConsole.warn = (...args: unknown[]) => {
      state.issues.push({ args, level: "warn" });
      state.originalWarn("[console.warn]", ...args);
    };
    testConsole.error = (...args: unknown[]) => {
      state.issues.push({ args, level: "error" });
      state.originalError("[console.error]", ...args);
    };
    state.installed = true;
  }

  if (state.afterEachInstalled) {
    return;
  }

  state.afterEachInstalled = true;
  afterEach(function assertNoUnexpectedConsoleIssues() {
    const issues = state.issues.splice(0);
    if (issues.length > 0) {
      throw new Error(formatUnexpectedConsoleIssues(issues));
    }
  });
}

export type { UnexpectedConsoleIssue };
export { formatUnexpectedConsoleIssues, installUnexpectedConsoleIssueGuard };
