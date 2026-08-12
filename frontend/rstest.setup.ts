import { afterEach, rs } from "@rstest/core";
import { cleanup } from "@testing-library/react";
import { installUnexpectedConsoleIssueGuard } from "./test.console-guard";

const restoreRealTimers = rs.useRealTimers;

installUnexpectedConsoleIssueGuard(afterEach);

afterEach(async function resetSharedDomTestEnvironment() {
  cleanup();
  rs.restoreAllMocks();
  rs.unstubAllEnvs();
  rs.unstubAllGlobals();

  try {
    restoreRealTimers();
  } catch {
    // Rstest throws when fake timers were never installed in the current test.
  }

  document.body.replaceChildren();
  await Promise.resolve();
  await new Promise<void>((resolve) => {
    setTimeout(resolve, 0);
  });
});
