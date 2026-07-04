import { Code, ConnectError } from "@connectrpc/connect";
import { cleanup, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it } from "vitest";

import { AppErrorTechnicalDetails } from "@/components/app-error-technical-details";
import { normalizeAppUiError } from "@/lib/ui-error";

afterEach(() => {
  cleanup();
});

describe("AppErrorTechnicalDetails", () => {
  it("renders native code blocks without an async markdown fallback", () => {
    const error = normalizeAppUiError(
      new ConnectError("meta database is unavailable", Code.Unavailable),
      {
        area: "boot-gate",
        request: {
          headers: { "connect-protocol-version": ["1"] },
          host: "localhost:8080",
          plaintext: true,
          requestJson: "{}",
          requestJsonNote: null,
          requestMethod: "POST",
          rpcPath: "/querylane.console.v1alpha1.OnboardingService/Bootstrap",
          url: "http://localhost:8080/querylane.console.v1alpha1.OnboardingService/Bootstrap",
        },
        source: "boot",
        surface: "route",
      }
    );
    const { container } = render(<AppErrorTechnicalDetails error={error} />);

    expect(screen.queryByText("Loading technical details…")).toBeNull();
    expect(container.querySelectorAll("pre code").length).toBeGreaterThan(0);
    screen.getByText("Captured error JSON");
  });
});
