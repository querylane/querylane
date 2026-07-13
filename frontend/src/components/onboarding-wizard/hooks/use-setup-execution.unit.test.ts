import { create as createProto } from "@bufbuild/protobuf";
import { Code, ConnectError } from "@connectrpc/connect";
import { beforeEach, describe, expect, it, vi } from "vitest";

import {
  resolveSetupFailureAction,
  useSetupExecution,
} from "@/components/onboarding-wizard/hooks/use-setup-execution";

const { cleanupCallbacks, useEffectEventMock, useEffectMock, useRefMock } =
  vi.hoisted(() => ({
    cleanupCallbacks: [] as Array<() => void>,
    useEffectEventMock: vi.fn((callback: unknown) => callback),
    useEffectMock: vi.fn(),
    useRefMock: vi.fn(),
  }));

vi.mock("react", () => ({
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
    getFailedEvent: vi.fn(() => null),
    onSuccess: vi.fn(),
    phase: "progress_running" as const,
    runSetupMutation: vi.fn(async () => undefined),
    selectedMethod: "embedded" as const,
    setConfigureValidationError: vi.fn(),
    setStreamFailure: vi.fn(),
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
  it("returns success action for already configured errors", () => {
    const result = resolveSetupFailureAction({
      error: new ConnectError("already configured", Code.FailedPrecondition),
      failedEvent: null,
    });

    expect(result).toEqual({ action: "success" });
  });

  it("returns configure action for invalid argument errors", () => {
    const result = resolveSetupFailureAction({
      error: new ConnectError("host is required", Code.InvalidArgument),
      failedEvent: null,
    });

    expect(result.action).toBe("configure");
    if (result.action !== "configure") {
      throw new Error("Expected configure result");
    }
    expect(result.configureError.message).toBe("host is required");
    expect(result.configureError.codeLabel).toBe("InvalidArgument");
  });

  it("returns error summary using failed event message when available", () => {
    const failedEvent = createProto(SetupProgressEventSchema, {
      displayName: "Apply migrations",
      error: "migration failed",
      state: StepState.FAILED,
      stepId: SetupStep.MIGRATING,
    });
    const result = resolveSetupFailureAction({
      error: new Error("generic error"),
      failedEvent,
    });

    expect(result.action).toBe("error_summary");
    if (result.action !== "error_summary") {
      throw new Error("Expected error summary result");
    }
    expect(result.streamError.message).toBe("migration failed");
    expect(result.streamError.context.stepId).toBe(SetupStep.MIGRATING);
  });

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

  it("does not run setup outside auto-run phases", () => {
    const options = createSetupOptions({
      phase: "method_selection",
      selectedMethod: null,
    });

    const result = useSetupExecution(options);

    expect(result.setupRunning).toBe(false);
    expect(options.runSetupMutation).not.toHaveBeenCalled();
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
        port: 6543,
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
      runSetupMutation: vi.fn(
        ({ signal }) =>
          new Promise<void>((_resolve, reject) => {
            signal.addEventListener("abort", () => {
              reject(new Error("request aborted"));
            });
          })
      ),
    });

    const result = useSetupExecution(options);
    const call = vi.mocked(options.runSetupMutation).mock.calls[0]?.[0];
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
      runSetupMutation: vi.fn(() =>
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
      runSetupMutation: vi.fn(() =>
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

  it("ignores setup failures after abort", async () => {
    const options = createSetupOptions({
      runSetupMutation: vi.fn(() =>
        Promise.reject(new Error("request cancelled"))
      ),
    });

    const result = useSetupExecution(options);
    result.abortSetup();
    await flushPromises();

    expect(options.onSuccess).not.toHaveBeenCalled();
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
      getFailedEvent: vi.fn(() => failedEvent),
      runSetupMutation: vi.fn(() => Promise.reject(new Error("boom"))),
    });

    useSetupExecution(options);
    await flushPromises();

    expect(options.setStreamFailure).toHaveBeenCalledWith(
      expect.objectContaining({ message: "migration failed" })
    );
  });
});
