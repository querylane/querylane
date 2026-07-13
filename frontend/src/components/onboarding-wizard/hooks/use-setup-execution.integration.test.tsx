import { act, renderHook } from "@testing-library/react";
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
