import { describe, expect, rs, test } from "@rstest/core";
import { act, renderHook } from "@testing-library/react";

import { useRetainedRetryError } from "@/components/use-retained-retry-error";

function createDeferred() {
  let reject!: (reason?: unknown) => void;
  let resolve!: () => void;
  const promise = new Promise<void>((resolvePromise, rejectPromise) => {
    resolve = resolvePromise;
    reject = rejectPromise;
  });
  return { promise, reject, resolve };
}

describe("useRetainedRetryError", () => {
  test("shows a changed error without a stale intermediate render", () => {
    const renderedErrors: (string | null)[] = [];
    const { rerender } = renderHook(
      ({ error }) => {
        const retryError = useRetainedRetryError({ error });
        renderedErrors.push(retryError.displayedError);
        return retryError;
      },
      {
        initialProps: { error: "Cannot connect" as string | null },
      }
    );

    renderedErrors.length = 0;
    rerender({ error: "Permission denied" });

    expect(renderedErrors).not.toContain("Cannot connect");
    expect(renderedErrors.at(-1)).toBe("Permission denied");
  });

  test("syncs displayed error to the latest error after a successful retry", async () => {
    const retryAttempt = createDeferred();
    const onRetry = rs.fn(() => retryAttempt.promise);
    const { rerender, result } = renderHook(
      ({ error }) => useRetainedRetryError({ error, onRetry }),
      {
        initialProps: { error: "Cannot connect" as string | null },
      }
    );

    expect(result.current.displayedError).toBe("Cannot connect");

    const { retry } = result.current;
    if (!retry) {
      throw new Error("Expected retry handler.");
    }

    let retryCompletion!: Promise<unknown>;
    act(() => {
      retryCompletion = retry();
    });
    rerender({ error: null });

    await act(async () => {
      retryAttempt.resolve();
      await retryCompletion;
    });

    expect(result.current.displayedError).toBeNull();
  });

  test("keeps the latest refreshed error after a failed retry", async () => {
    const retryAttempt = createDeferred();
    const onRetry = rs.fn(() => retryAttempt.promise);
    const { rerender, result } = renderHook(
      ({ error }) => useRetainedRetryError({ error, onRetry }),
      {
        initialProps: { error: "Cannot connect" as string | null },
      }
    );

    const { retry } = result.current;
    if (!retry) {
      throw new Error("Expected retry handler.");
    }

    let retryCompletion!: Promise<unknown>;
    act(() => {
      retryCompletion = retry();
    });
    rerender({ error: "Still cannot connect" });

    await act(async () => {
      retryAttempt.reject(new Error("Retry failed"));
      await retryCompletion;
    });

    expect(result.current.displayedError).toBe("Still cannot connect");
  });
});
