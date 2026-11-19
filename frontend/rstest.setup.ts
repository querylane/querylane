import { afterEach } from "@rstest/core";
import { cleanup } from "@testing-library/react";
import { installUnexpectedConsoleIssueGuard } from "./test.console-guard";

installUnexpectedConsoleIssueGuard(afterEach);

afterEach(function resetSharedDomTestEnvironment() {
  cleanup();
  document.body.replaceChildren();
});
