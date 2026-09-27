import { create as createProto } from "@bufbuild/protobuf";
import { Code, ConnectError } from "@connectrpc/connect";
import { beforeEach, describe, expect, it, rs } from "@rstest/core";
import * as reactActual from "react" with { rstest: "importActual" };

import {
  resolveSetupFailureAction,
  useSetupExecution,
} from "@/components/onboarding-wizard/hooks/use-setup-execution";

const { cleanupCallbacks, useEffectEventMock, useEffectMock, useRefMock } =
  rs.hoisted(() => ({
    cleanupCallbacks: [] as Array<() => void>,
    useEffectEventMock: rs.fn((callback: unknown) => callback),
    useEffectMock: rs.fn(),
    useRefMock: rs.fn(),
  }));

rs.mock("react", () => ({
  ...reactActual,
  useEffect: useEffectMock,
  useEffectEvent: useEffectEventMock,
  useRef: useRefMock,
}));

function flushPromises() {
  return new Promise<void>((resolve) => queueMicrotask(resolve));
}

function arrangeReactHooks() {
  cleanupCallbacks.length = 0;
  useRefMock.mockImplementation((initialValue: unknown) => ({
    current: initialValue,
  }));
  useEffectMock.mockImplementation(
    (callback: () => undefined | (() => void)) => {
      const cleanup = callback();
      if (typeof cleanup === "function") {
        cleanupCallbacks.push(cleanup);
      }
    }
  );
}

function createSetupOptions(
  overrides: Partial<Parameters<typeof useSetupExecution>[0]> = {}
) {
  return {
    getFailedEvent: rs.fn(() => null),
    onSuccess: rs.fn(),
    phase: "progress_running" as const,
    runSetupMutation: rs.fn(async () => undefined),
    selectedMethod: "embedded" as const,
    setConfigureValidationError: rs.fn(),
    setStreamFailure: rs.fn(),
    setupRunToken: 1,
    submittedEmbeddedConfig: null,
    submittedPostgresConfig: null,
    ...overrides,
  };
}

import {
  EmbeddedSetupConfigSchema,
  SetupProgressEventSchema,
  SetupStep,
  StepState,
} from "@/protogen/querylane/console/v1alpha1/onboarding_pb";

describe("resolveSetupFailureAction", () => {
  it("returns fallback setup failure message for unknown errors", () => {
    const result = resolveSetupFailureAction({
      error: { reason: "unknown" },
      failedEvent: null,
    });

    expect(result.action).toBe("error_summary");
    if (result.action !== "error_summary") {
      throw new Error("Expected error summary result");
    }
    expect(result.streamError.message).toBe("Setup failed");
    expect(result.streamError.source).toBe("setup");
  });
});

describe("useSetupExecution", () => {
  beforeEach(() => {
    useEffectMock.mockReset();
    useRefMock.mockReset();
    arrangeReactHooks();
  });

  it("does not run setup before an explicit run is requested", () => {
    const options = createSetupOptions({ setupRunToken: 0 });

    useSetupExecution(options);

    expect(options.runSetupMutation).not.toHaveBeenCalled();
  });

  it("runs embedded setup with submitted config and calls success", async () => {
    const options = createSetupOptions({
      submittedEmbeddedConfig: createProto(EmbeddedSetupConfigSchema, {
        mode: "ephemeral",
      }),
    });

    const result = useSetupExecution(options);
    await flushPromises();

    expect(result.setupRunning).toBe(true);
    expect(options.runSetupMutation).toHaveBeenCalledWith({
      request: expect.objectContaining({
        setup: expect.objectContaining({ case: "embeddedConfig" }),
      }),
      signal: expect.any(AbortSignal),
    });
    expect(options.onSuccess).toHaveBeenCalledTimes(1);
  });

  it("aborts in-flight setup through returned action and cleanup", async () => {
    const options = createSetupOptions({
      runSetupMutation: rs.fn(
        ({ signal }) =>
          new Promise<void>((_resolve, reject) => {
            signal.addEventListener("abort", () => {
              reject(new Error("request aborted"));
            });
          })
      ),
    });

    const result = useSetupExecution(options);
    const call = rs.mocked(options.runSetupMutation).mock.calls[0]?.[0];
    if (!call?.signal) {
      throw new Error("expected setup mutation call with signal");
    }

    result.abortSetup();
    await flushPromises();
    expect(call.signal.aborted).toBe(true);

    const cleanup = cleanupCallbacks.at(-1);
    if (!cleanup) {
      throw new Error("expected setup cleanup callback");
    }
    cleanup();
    expect(call.signal.aborted).toBe(true);
    expect(options.setStreamFailure).not.toHaveBeenCalled();
  });

  it("routes invalid setup errors back to configure validation", async () => {
    const options = createSetupOptions({
      runSetupMutation: rs.fn(() =>
        Promise.reject(
          new ConnectError("host is required", Code.InvalidArgument)
        )
      ),
    });

    useSetupExecution(options);
    await flushPromises();

    expect(options.setConfigureValidationError).toHaveBeenCalledWith(
      expect.objectContaining({ message: "host is required" })
    );
    expect(options.setStreamFailure).not.toHaveBeenCalled();
  });

  it("treats already-configured setup responses as successful", async () => {
    const options = createSetupOptions({
      runSetupMutation: rs.fn(() =>
        Promise.reject(
          new ConnectError("already configured", Code.FailedPrecondition)
        )
      ),
    });

    useSetupExecution(options);
    await flushPromises();

    expect(options.onSuccess).toHaveBeenCalledTimes(1);
    expect(options.setConfigureValidationError).not.toHaveBeenCalled();
    expect(options.setStreamFailure).not.toHaveBeenCalled();
  });

  it("routes stream failures to the error summary", async () => {
    const failedEvent = createProto(SetupProgressEventSchema, {
      displayName: "Migrate",
      error: "migration failed",
      state: StepState.FAILED,
      stepId: SetupStep.MIGRATING,
    });
    const options = createSetupOptions({
      getFailedEvent: rs.fn(() => failedEvent),
      runSetupMutation: rs.fn(() => Promise.reject(new Error("boom"))),
    });

    useSetupExecution(options);
    await flushPromises();

    expect(options.setStreamFailure).toHaveBeenCalledWith(
      expect.objectContaining({ message: "migration failed" })
    );
  });
});
