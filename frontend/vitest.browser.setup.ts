import "./vitest.browser.setup.css";
import { afterEach } from "vitest";
import { installUnexpectedConsoleIssueGuard } from "./test.console-guard";

installUnexpectedConsoleIssueGuard(afterEach);

const browserTheme =
  import.meta.env.PUBLIC_TEST_BROWSER_THEME === "dark" ? "dark" : "light";

document.documentElement.classList.remove("light", "dark");
document.documentElement.classList.add(browserTheme);
document.documentElement.dataset["visualTheme"] = browserTheme;
document.documentElement.dataset["testMotion"] = "reduced";
document.documentElement.style.colorScheme = browserTheme;
