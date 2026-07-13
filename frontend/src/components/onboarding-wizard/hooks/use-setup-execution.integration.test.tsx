import { act, renderHook } from "@testing-library/react";
import { useLayoutEffect } from "react";
import { flushSync } from "react-dom";
import { createRoot } from "react-dom/client";
import { describe, expect, it, vi } from "vitest";

import { useSetupExecution } from "@/components/onboarding-wizard/hooks/use-setup-execution";
import type { SetupAppDatabaseMutationVariables } from "@/hooks/api/onboarding";

function createDeferred() {
  let resolve!: () => void;
  const promise = new Promise<void>((resolvePromise) => {
    resolve = resolvePromise;
  });
  return { promise, resolve };
}

describe("useSetupExecution", () => {
  it("keeps an in-flight setup running when callback identity changes", async () => {
    const setup = createDeferred();
    const runSetupMutation = vi.fn(
      (_variables: SetupAppDatabaseMutationVariables) => setup.promise
    );
    const firstOnSuccess = vi.fn();
    const secondOnSuccess = vi.fn();
    const stableOptions = {
      getFailedEvent: vi.fn(() => null),
      phase: "progress_running" as const,
      runSetupMutation,
      selectedMethod: "embedded" as const,
      setConfigureValidationError: vi.fn(),
      setStreamFailure: vi.fn(),
      setupRunToken: 1,
      submittedEmbeddedConfig: null,
      submittedPostgresConfig: null,
    };
    const { rerender } = renderHook(
      ({ onSuccess }) => useSetupExecution({ ...stableOptions, onSuccess }),
      { initialProps: { onSuccess: firstOnSuccess } }
    );
    const firstSignal = runSetupMutation.mock.calls[0]?.[0].signal;
    if (!firstSignal) {
      throw new Error("Expected setup mutation call with an abort signal");
    }

    rerender({ onSuccess: secondOnSuccess });

    expect(firstSignal.aborted).toBe(false);
    expect(runSetupMutation).toHaveBeenCalledTimes(1);

    await act(async () => {
      setup.resolve();
      await setup.promise;
    });

    expect(firstOnSuccess).not.toHaveBeenCalled();
    expect(secondOnSuccess).toHaveBeenCalledTimes(1);
  });

  it("uses the latest completion callback before passive effects flush", async () => {
    const setup = createDeferred();
    let markUpdateCommitted!: () => void;
    const updateCommitted = new Promise<void>((resolve) => {
      markUpdateCommitted = resolve;
    });
    const runSetupMutation = vi.fn(
      (_variables: SetupAppDatabaseMutationVariables) => setup.promise
    );
    const firstOnSuccess = vi.fn();
    const secondOnSuccess = vi.fn();
    const stableOptions = {
      getFailedEvent: vi.fn(() => null),
      phase: "progress_running" as const,
      runSetupMutation,
      selectedMethod: "embedded" as const,
      setConfigureValidationError: vi.fn(),
      setStreamFailure: vi.fn(),
      setupRunToken: 1,
      submittedEmbeddedConfig: null,
      submittedPostgresConfig: null,
    };

    function Harness({
      onSuccess,
      settleInLayout,
    }: {
      onSuccess: () => void;
      settleInLayout: boolean;
    }) {
      useSetupExecution({ ...stableOptions, onSuccess });
      useLayoutEffect(
        function settleSetupDuringCommit() {
          if (settleInLayout) {
            setup.resolve();
            markUpdateCommitted();
          }
        },
        [settleInLayout]
      );
      return null;
    }

    const root = createRoot(document.createElement("div"));
    const actEnvironmentKey = "IS_REACT_ACT_ENVIRONMENT";
    const previousActEnvironment = Reflect.get(globalThis, actEnvironmentKey);
    Reflect.set(globalThis, actEnvironmentKey, false);

    try {
      flushSync(() => {
        root.render(
          <Harness onSuccess={firstOnSuccess} settleInLayout={false} />
        );
      });
      await new Promise((resolve) => setTimeout(resolve, 0));
      expect(runSetupMutation).toHaveBeenCalledTimes(1);

      root.render(
        <Harness onSuccess={secondOnSuccess} settleInLayout={true} />
      );
      await updateCommitted;
      await Promise.resolve();

      expect(firstOnSuccess).not.toHaveBeenCalled();
      expect(secondOnSuccess).toHaveBeenCalledTimes(1);
    } finally {
      flushSync(() => root.unmount());
      if (previousActEnvironment === undefined) {
        Reflect.deleteProperty(globalThis, actEnvironmentKey);
      } else {
        Reflect.set(globalThis, actEnvironmentKey, previousActEnvironment);
      }
    }
  });

  it("restarts setup when the run token changes", () => {
    const runSetupMutation = vi.fn(
      ({ signal }: SetupAppDatabaseMutationVariables) =>
        new Promise<void>((_resolve, reject) => {
          signal?.addEventListener(
            "abort",
            () => reject(new Error("Setup aborted")),
            { once: true }
          );
        })
    );
    const stableOptions = {
      getFailedEvent: vi.fn(() => null),
      onSuccess: vi.fn(),
      phase: "progress_running" as const,
      runSetupMutation,
      selectedMethod: "embedded" as const,
      setConfigureValidationError: vi.fn(),
      setStreamFailure: vi.fn(),
      submittedEmbeddedConfig: null,
      submittedPostgresConfig: null,
    };
    const { rerender, unmount } = renderHook(
      ({ setupRunToken }) =>
        useSetupExecution({ ...stableOptions, setupRunToken }),
      { initialProps: { setupRunToken: 1 } }
    );
    const firstSignal = runSetupMutation.mock.calls[0]?.[0].signal;
    if (!firstSignal) {
      throw new Error("Expected setup mutation call with an abort signal");
    }

    rerender({ setupRunToken: 2 });

    expect(firstSignal.aborted).toBe(true);
    expect(runSetupMutation).toHaveBeenCalledTimes(2);

    unmount();
  });
});
