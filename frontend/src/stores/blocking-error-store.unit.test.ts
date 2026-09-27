import { beforeEach, describe, expect, test } from "@rstest/core";
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
    retryGuidance: null,
    source: "unknown",
    stack: null,
    summary: message,
    technicalDetails: "",
    title: "Test error",
    unexpectedResponse: null,
  };
}

beforeEach(() => {
  useBlockingErrorStore.setState({
    blockingError: null,
    returnTo: null,
  });
});

describe("blocking-error-store", () => {
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

  test("consumeBlockingError returns nulls when no error is set", () => {
    const result = useBlockingErrorStore.getState().consumeBlockingError();

    expect(result.error).toBeNull();
    expect(result.returnTo).toBeNull();
  });
});
