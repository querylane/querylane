import { create } from "@bufbuild/protobuf";
import {
  Code,
  ConnectError,
  createContextValues,
  type UnaryRequest,
  type UnaryResponse,
} from "@connectrpc/connect";
import { describe, expect, test, vi } from "vitest";

import {
  createSetupInterceptor,
  DEFAULT_RPC_TIMEOUT_MS,
  LONG_RUNNING_RPC_TIMEOUT_MS,
  resolveConnectBaseUrl,
} from "@/lib/transport";
import type { AppUiError } from "@/lib/ui-error-types";
import {
  ConsoleService,
  GetConsoleConfigRequestSchema,
  GetConsoleConfigResponseSchema,
} from "@/protogen/querylane/console/v1alpha1/console_pb";
import {
  InstanceService,
  TestInstanceConnectionRequestSchema,
} from "@/protogen/querylane/console/v1alpha1/instance_pb";

type SetupInterceptorDependencies = NonNullable<
  Parameters<typeof createSetupInterceptor>[0]
>;

function createFakeLogger() {
  return {
    debug: () => undefined,
    error: () => undefined,
    fatal: () => undefined,
    fmt: (
      strings: TemplateStringsArray | ArrayLike<string>,
      ...values: unknown[]
    ) =>
      Array.from(strings).reduce(
        (result, part, index) => result + part + String(values[index] ?? ""),
        ""
      ),
    info: () => undefined,
    trace: () => undefined,
    warn: () => undefined,
  };
}

function createUnaryConsoleConfigRequest(): UnaryRequest<
  typeof GetConsoleConfigRequestSchema,
  typeof GetConsoleConfigResponseSchema
> {
  return {
    contextValues: createContextValues(),
    header: new Headers(),
    message: create(GetConsoleConfigRequestSchema),
    method: ConsoleService.method.getConsoleConfig,
    requestMethod: "POST",
    service: ConsoleService,
    signal: new AbortController().signal,
    stream: false,
    url: "http://localhost:8080/querylane.console.v1alpha1.ConsoleService/GetConsoleConfig",
  };
}

function createUnaryConsoleConfigResponse(): UnaryResponse<
  typeof GetConsoleConfigRequestSchema,
  typeof GetConsoleConfigResponseSchema
> {
  return {
    header: new Headers(),
    message: create(GetConsoleConfigResponseSchema),
    method: ConsoleService.method.getConsoleConfig,
    service: ConsoleService,
    stream: false,
    trailer: new Headers(),
  };
}

function createTestInstanceConnectionRequest(): UnaryRequest<
  typeof TestInstanceConnectionRequestSchema,
  (typeof InstanceService.method.testInstanceConnection)["output"]
> {
  return {
    ...createUnaryConsoleConfigRequest(),
    message: create(TestInstanceConnectionRequestSchema),
    method: InstanceService.method.testInstanceConnection,
    service: InstanceService,
    url: "http://localhost:8080/querylane.console.v1alpha1.InstanceService/TestInstanceConnection",
  };
}

function createTestInterceptor() {
  const blockingErrors: Array<{
    error: AppUiError;
    returnTo?: string | null | undefined;
  }> = [];
  let setupRequiredCalls = 0;
  const dependencies: SetupInterceptorDependencies = {
    getCurrentHref: () => "/instances/prod-us-east",
    loadBlockingErrorStore: async () => ({
      useBlockingErrorStore: {
        getState: () => ({
          setBlockingError: (error, returnTo) => {
            blockingErrors.push({ error, returnTo });
          },
        }),
      },
    }),
    logger: createFakeLogger(),
    markSetupRequired: () => {
      setupRequiredCalls += 1;
    },
  };

  return {
    blockingErrors,
    getSetupRequiredCalls: () => setupRequiredCalls,
    interceptor: createSetupInterceptor(dependencies),
  };
}

describe("transport configuration", () => {
  test.each([
    {
      configuredBaseUrl: "",
      expected: "https://demo.querylane.net",
      isDevelopment: false,
      locationOrigin: "https://demo.querylane.net",
    },
    {
      configuredBaseUrl: "",
      expected: "http://localhost:8080",
      isDevelopment: true,
      locationOrigin: "http://localhost:3000",
    },
    {
      configuredBaseUrl: "https://api.querylane.example",
      expected: "https://api.querylane.example",
      isDevelopment: false,
      locationOrigin: "https://demo.querylane.net",
    },
  ])("resolves $expected", ({ expected, ...options }) => {
    expect(resolveConnectBaseUrl(options)).toBe(expected);
  });

  test("keeps the established deadline tiers", () => {
    expect(DEFAULT_RPC_TIMEOUT_MS).toBe(30_000);
    expect(LONG_RUNNING_RPC_TIMEOUT_MS).toBe(90_000);
    expect(LONG_RUNNING_RPC_TIMEOUT_MS).toBeGreaterThan(DEFAULT_RPC_TIMEOUT_MS);
  });
});

describe("transport error interceptor", () => {
  test("passes successful calls through", async () => {
    const { interceptor } = createTestInterceptor();
    const response = createUnaryConsoleConfigResponse();

    await expect(
      interceptor(() => Promise.resolve(response))(
        createUnaryConsoleConfigRequest()
      )
    ).resolves.toBe(response);
  });

  test("does not capture request payloads on failures", async () => {
    const failure = new ConnectError("setup required", Code.FailedPrecondition);
    failure.details = [
      {
        debug: { reason: "ERROR_REASON_APP_DATABASE_NOT_CONFIGURED" },
        type: "google.rpc.ErrorInfo",
        value: new Uint8Array([1]),
      },
    ];
    const { blockingErrors, interceptor } = createTestInterceptor();

    await expect(
      interceptor(() => Promise.reject(failure))(
        createUnaryConsoleConfigRequest()
      )
    ).rejects.toBe(failure);

    expect(blockingErrors[0]?.error.context).toEqual({
      area: "transport",
      endpoint: "querylane.console.v1alpha1.ConsoleService/GetConsoleConfig",
      source: "connect",
    });
  });

  test("passes unexpected failures through without blockers", async () => {
    const failure = new Error("rpc failed");
    const { blockingErrors, getSetupRequiredCalls, interceptor } =
      createTestInterceptor();

    await expect(
      interceptor(() => Promise.reject(failure))(
        createUnaryConsoleConfigRequest()
      )
    ).rejects.toBe(failure);

    expect(blockingErrors).toHaveLength(0);
    expect(getSetupRequiredCalls()).toBe(0);
  });

  test("does not globally report expected connection-test failures", async () => {
    const failure = new ConnectError(
      "PostgreSQL rejected this password",
      Code.InvalidArgument
    );
    const reportError = vi.fn();
    vi.stubGlobal("reportError", reportError);
    const { interceptor } = createTestInterceptor();

    try {
      await expect(
        interceptor(() => Promise.reject(failure))(
          createTestInstanceConnectionRequest()
        )
      ).rejects.toBe(failure);
      expect(reportError).not.toHaveBeenCalled();
    } finally {
      vi.unstubAllGlobals();
    }
  });

  test("routes setup-required failures", async () => {
    const failure = new ConnectError("setup required", Code.FailedPrecondition);
    failure.details = [
      {
        debug: { reason: "ERROR_REASON_APP_DATABASE_NOT_CONFIGURED" },
        type: "google.rpc.ErrorInfo",
        value: new Uint8Array([1]),
      },
    ];
    const { blockingErrors, getSetupRequiredCalls, interceptor } =
      createTestInterceptor();

    await expect(
      interceptor(() => Promise.reject(failure))(
        createUnaryConsoleConfigRequest()
      )
    ).rejects.toBe(failure);

    expect(getSetupRequiredCalls()).toBe(1);
    expect(blockingErrors[0]?.error.blockingReason).toBe("setup_required");
    expect(blockingErrors[0]?.returnTo).toBe("/instances/prod-us-east");
  });

  test("routes unauthenticated failures", async () => {
    const failure = new ConnectError("login required", Code.Unauthenticated);
    const { blockingErrors, getSetupRequiredCalls, interceptor } =
      createTestInterceptor();

    await expect(
      interceptor(() => Promise.reject(failure))(
        createUnaryConsoleConfigRequest()
      )
    ).rejects.toBe(failure);

    expect(getSetupRequiredCalls()).toBe(0);
    expect(blockingErrors[0]?.error.blockingReason).toBe("unauthenticated");
  });
});
