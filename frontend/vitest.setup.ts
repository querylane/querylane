import { cleanup } from "@testing-library/react";
import { afterEach, vi } from "vitest";

const consoleWarnPatchFlag = Symbol.for("querylane.test.console-warn-patched");

if (!Reflect.get(globalThis, consoleWarnPatchFlag)) {
  const testConsole = globalThis.console;
  const originalConsoleWarn = testConsole.warn.bind(testConsole);
  testConsole.warn = (...args: unknown[]) => {
    originalConsoleWarn("[console.warn]", ...args);
  };
  Reflect.set(globalThis, consoleWarnPatchFlag, true);
}

afterEach(async function resetSharedDomTestEnvironment() {
  cleanup();
  vi.restoreAllMocks();
  vi.unstubAllEnvs();
  vi.unstubAllGlobals();

  try {
    vi.useRealTimers();
  } catch {
    // Vitest throws when fake timers were never installed in the current test.
  }

  document.body.replaceChildren();
  await Promise.resolve();
  await new Promise<void>((resolve) => {
    setTimeout(resolve, 0);
  });
});
