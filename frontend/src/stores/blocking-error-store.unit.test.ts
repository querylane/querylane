import { beforeEach, describe, expect, test } from "vitest";
import type { AppUiError } from "@/lib/ui-error-types";
import { useBlockingErrorStore } from "@/stores/blocking-error-store";

function makeFakeError(message: string): AppUiError {
  return {
    blockingReason: null,
    code: null,
    codeLabel: null,
    connectDomain: null,
    connectReason: null,
    context: {},
    details: [],
    manualRetryable: false,
    message,
    metadata: {},
    originalError: new Error(message),
    postgres: null,
    rawMessage: message,
    reproduction: null,
    retryGuidance: null,
    source: "unknown",
    stack: null,
    technicalDetails: "",
    technicalDetailsObject: {},
    technicalDetailsText: "",
    title: "Test error",
  };
}

beforeEach(() => {
  useBlockingErrorStore.setState({
    blockingError: null,
    returnTo: null,
  });
});

describe("blocking-error-store", () => {
  test("setBlockingError stores the error and returnTo", () => {
    const error = makeFakeError("something broke");

    useBlockingErrorStore.getState().setBlockingError(error, "/dashboard");

    const state = useBlockingErrorStore.getState();
    expect(state.blockingError).toBe(error);
    expect(state.returnTo).toBe("/dashboard");
  });

  test("setBlockingError defaults returnTo to null when omitted", () => {
    const error = makeFakeError("no return");

    useBlockingErrorStore.getState().setBlockingError(error);

    expect(useBlockingErrorStore.getState().returnTo).toBeNull();
  });

  test("clearBlockingError resets error and returnTo to null", () => {
    const error = makeFakeError("will be cleared");
    useBlockingErrorStore.getState().setBlockingError(error, "/previous");

    useBlockingErrorStore.getState().clearBlockingError();

    const state = useBlockingErrorStore.getState();
    expect(state.blockingError).toBeNull();
    expect(state.returnTo).toBeNull();
  });

  test("consumeBlockingError returns the current error and clears the store", () => {
    const error = makeFakeError("consumed");
    useBlockingErrorStore.getState().setBlockingError(error, "/return-path");

    const result = useBlockingErrorStore.getState().consumeBlockingError();

    expect(result.error).toBe(error);
    expect(result.returnTo).toBe("/return-path");

    const state = useBlockingErrorStore.getState();
    expect(state.blockingError).toBeNull();
    expect(state.returnTo).toBeNull();
  });

  test("consumeBlockingError returns nulls when no error is set", () => {
    const result = useBlockingErrorStore.getState().consumeBlockingError();

    expect(result.error).toBeNull();
    expect(result.returnTo).toBeNull();
  });

  test("setBlockingError overwrites the previous error", () => {
    const first = makeFakeError("first");
    const second = makeFakeError("second");

    useBlockingErrorStore.getState().setBlockingError(first, "/one");
    useBlockingErrorStore.getState().setBlockingError(second, "/two");

    const state = useBlockingErrorStore.getState();
    expect(state.blockingError).toBe(second);
    expect(state.returnTo).toBe("/two");
  });
});
