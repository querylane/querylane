import "./browser-test.setup.css";
import { afterEach, rs } from "@rstest/core";
import { installUnexpectedConsoleIssueGuard } from "./test.console-guard";

const restoreRealTimers = rs.useRealTimers;

installUnexpectedConsoleIssueGuard(afterEach);

afterEach(async function resetSharedBrowserTestEnvironment() {
  rs.restoreAllMocks();
  rs.unstubAllEnvs();
  rs.unstubAllGlobals();

  try {
    restoreRealTimers();
  } catch {
    // Rstest throws when fake timers were never installed in the current test.
  }

  await Promise.resolve();
});

const browserTheme =
  import.meta.env.PUBLIC_TEST_BROWSER_THEME === "dark" ? "dark" : "light";

document.documentElement.classList.remove("light", "dark");
document.documentElement.classList.add(browserTheme);
document.documentElement.dataset["visualTheme"] = browserTheme;
document.documentElement.dataset["testMotion"] = "reduced";
document.documentElement.style.colorScheme = browserTheme;
