import { Code } from "@connectrpc/connect";
import { describe, expect, it } from "vitest";
import type { AppUiError, BlockingErrorReason } from "@/lib/ui-error-types";
import {
  decideBlockingAppRedirect,
  decideBlockingAppState,
} from "@/stores/blocking-app-state";

function createAppUiError(
  blockingReason: BlockingErrorReason | null
): AppUiError {
  return {
    blockingReason,
    code: blockingReason === "unauthenticated" ? Code.Unauthenticated : null,
    codeLabel: null,
    connectDomain: null,
    connectReason: null,
    context: {},
    details: [],
    manualRetryable: false,
    message: "failed",
    metadata: {},
    originalError: new Error("failed"),
    postgres: null,
    rawMessage: "failed",
    reproduction: null,
    retryGuidance: null,
    source: "connect",
    stack: null,
    technicalDetails: "{}",
    technicalDetailsObject: {},
    technicalDetailsText: "failed",
    title: "Request failed",
  };
}

describe("blocking app state policy", () => {
  it("turns setup-required errors into setup state and route blockers", () => {
    const error = createAppUiError("setup_required");

    expect(
      decideBlockingAppState({ currentHref: "/instances/prod", error })
    ).toEqual({
      blockingError: error,
      redirectTo: "/setup",
      returnTo: "/instances/prod",
      setupRequired: true,
    });
  });

  it("turns unauthenticated errors into access blockers without setup state", () => {
    const error = createAppUiError("unauthenticated");

    expect(
      decideBlockingAppState({ currentHref: "/instances/prod", error })
    ).toEqual({
      blockingError: error,
      redirectTo: "/access-denied",
      returnTo: "/instances/prod",
      setupRequired: false,
    });
  });

  it("turns permission errors into access blockers without setup state", () => {
    const error = createAppUiError("permission_denied");

    expect(decideBlockingAppState({ currentHref: null, error })).toEqual({
      blockingError: error,
      redirectTo: "/access-denied",
      returnTo: null,
      setupRequired: false,
    });
  });

  it("ignores non-blocking errors", () => {
    const error = createAppUiError(null);

    expect(
      decideBlockingAppState({ currentHref: "/instances/prod", error })
    ).toEqual({
      blockingError: null,
      redirectTo: null,
      returnTo: null,
      setupRequired: false,
    });
  });

  it("gives explicit blocking errors precedence over onboarding redirects", () => {
    expect(
      decideBlockingAppRedirect({
        blockingReason: "permission_denied",
        currentHref: "/instances/prod",
        returnTo: null,
        setupStatus: "onboarding",
      })
    ).toEqual({
      replace: true,
      search: {
        returnTo: "/instances/prod",
      },
      to: "/access-denied",
    });
  });

  it("returns null when no route redirect is needed", () => {
    expect(
      decideBlockingAppRedirect({
        blockingReason: null,
        currentHref: "/instances/prod",
        returnTo: null,
        setupStatus: "ready",
      })
    ).toBeNull();
  });

  it("redirects onboarding state to setup when there is no blocking error", () => {
    expect(
      decideBlockingAppRedirect({
        blockingReason: null,
        currentHref: "/instances/prod",
        returnTo: "/queries",
        setupStatus: "onboarding",
      })
    ).toEqual({
      replace: true,
      search: {
        returnTo: "/queries",
      },
      to: "/setup",
    });
  });
});
