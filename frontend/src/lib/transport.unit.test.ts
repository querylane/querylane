import { create as createProto } from "@bufbuild/protobuf";
import {
  Code,
  ConnectError,
  createContextValues,
  type UnaryRequest,
  type UnaryResponse,
} from "@connectrpc/connect";
import { describe, expect, it, vi } from "vitest";

import {
  createObservedConnectFetch,
  createSetupInterceptor,
  DEFAULT_RPC_TIMEOUT_MS,
  LONG_RUNNING_RPC_TIMEOUT_MS,
  resolveConnectBaseUrl,
} from "@/lib/transport";
import type { AppUiError } from "@/lib/ui-error-types";
import {
  CONNECT_ERROR_SNAPSHOT_BODY_HEADER,
  CONNECT_ERROR_SNAPSHOT_STATUS_HEADER,
  REQUEST_PAYLOAD_SERIALIZATION_FAILURE_MESSAGE,
  STREAMING_INPUT_REQUEST_MESSAGE,
} from "@/lib/ui-error-types";
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

const APP_UI_ERROR_CONTEXT = Symbol.for("querylane.app-ui-error-context");

function getAttachedRequestJsonNote(error: unknown): string | null | undefined {
  if (!(typeof error === "object" && error !== null)) {
    return;
  }

  const attachedContext = Reflect.get(error, APP_UI_ERROR_CONTEXT);
  if (!(typeof attachedContext === "object" && attachedContext !== null)) {
    return;
  }

  const request = Reflect.get(attachedContext, "request");
  if (!(typeof request === "object" && request !== null)) {
    return;
  }

  const requestJsonNote = Reflect.get(request, "requestJsonNote");
  return typeof requestJsonNote === "string" || requestJsonNote === null
    ? requestJsonNote
    : undefined;
}

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
    header: new Headers({
      "Connect-Protocol-Version": "1",
      "Content-Type": "application/json",
    }),
    message: createProto(GetConsoleConfigRequestSchema),
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
    message: createProto(GetConsoleConfigResponseSchema),
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
    contextValues: createContextValues(),
    header: new Headers({
      "Connect-Protocol-Version": "1",
      "Content-Type": "application/json",
    }),
    message: createProto(TestInstanceConnectionRequestSchema),
    method: InstanceService.method.testInstanceConnection,
    requestMethod: "POST",
    service: InstanceService,
    signal: new AbortController().signal,
    stream: false,
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
            blockingErrors.push({
              error,
              returnTo,
            });
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

describe("transport base URL", () => {
  it("uses same-origin RPCs for production builds without an explicit public API URL", () => {
    expect(
      resolveConnectBaseUrl({
        configuredBaseUrl: "",
        isDevelopment: false,
        locationOrigin: "https://demo.querylane.net",
      })
    ).toBe("https://demo.querylane.net");
  });

  it("keeps localhost fallback for local development", () => {
    expect(
      resolveConnectBaseUrl({
        configuredBaseUrl: "",
        isDevelopment: true,
        locationOrigin: "http://localhost:3000",
      })
    ).toBe("http://localhost:8080");
  });

  it("uses explicit public API URL when configured", () => {
    expect(
      resolveConnectBaseUrl({
        configuredBaseUrl: "https://api.querylane.example",
        isDevelopment: false,
        locationOrigin: "https://demo.querylane.net",
      })
    ).toBe("https://api.querylane.example");
  });
});

describe("transport deadlines", () => {
  it("keeps the default deadline at the ReadRows statement timeout and long-running above the SQL cap", () => {
    expect(DEFAULT_RPC_TIMEOUT_MS).toBe(30_000);
    expect(LONG_RUNNING_RPC_TIMEOUT_MS).toBe(90_000);
    expect(LONG_RUNNING_RPC_TIMEOUT_MS).toBeGreaterThan(DEFAULT_RPC_TIMEOUT_MS);
  });
});

describe("transport error instrumentation", () => {
  it("captures failed response bodies for downstream error decoding", async () => {
    const observedFetch = createObservedConnectFetch(
      async () =>
        new Response(
          JSON.stringify({
            code: "not_found",
            message: "database not found",
          }),
          {
            headers: {
              "content-type": "application/json",
            },
            status: 404,
            statusText: "Not Found",
          }
        )
    );

    const response = await observedFetch("http://localhost:8080/test", {
      method: "POST",
    });

    expect(
      response.headers.get(CONNECT_ERROR_SNAPSHOT_BODY_HEADER)
    ).toBeTruthy();
    await response.text();
  });

  it("passes null-body responses through without rebuilding them", async () => {
    const noContentResponse = new Response(null, { status: 204 });
    const observedFetch = createObservedConnectFetch(
      async () => noContentResponse
    );

    const response = await observedFetch("http://localhost:8080/test", {
      method: "POST",
    });

    expect(response).toBe(noContentResponse);
    expect(response.headers.get(CONNECT_ERROR_SNAPSHOT_BODY_HEADER)).toBeNull();
  });

  it("does not rebuild not-modified responses with a forbidden body", async () => {
    const notModifiedResponse = new Response(null, {
      status: 304,
      statusText: "Not Modified",
    });
    const observedFetch = createObservedConnectFetch(
      async () => notModifiedResponse
    );

    const response = await observedFetch("http://localhost:8080/test", {
      method: "GET",
    });

    expect(response).toBe(notModifiedResponse);
    expect(response.status).toBe(304);
  });

  it("does not require fetch.preconnect to exist", () => {
    const originalFetch = globalThis.fetch;
    const fakeFetch = Object.assign(
      async () => new Response(null, { status: 204 }),
      {}
    );

    Object.defineProperty(globalThis, "fetch", {
      configurable: true,
      value: fakeFetch,
    });

    try {
      const observedFetch = createObservedConnectFetch(() =>
        Promise.resolve(new Response(null, { status: 204 }))
      );

      expect("preconnect" in observedFetch).toBe(false);
    } finally {
      Object.defineProperty(globalThis, "fetch", {
        configurable: true,
        value: originalFetch,
      });
    }
  });

  it("passes unexpected transport failures through without blockers", async () => {
    const failure = new Error("rpc failed");
    const { blockingErrors, getSetupRequiredCalls, interceptor } =
      createTestInterceptor();

    await expect(
      interceptor(() => Promise.reject(failure))(
        createUnaryConsoleConfigRequest()
      )
    ).rejects.toThrow("rpc failed");

    expect(blockingErrors.length).toBe(0);
    expect(getSetupRequiredCalls()).toBe(0);
  });

  it("does not globally report expected connection-test failures", async () => {
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

  it("captures request context for grpc-style transcripts", async () => {
    const failure = new ConnectError("setup required", Code.FailedPrecondition);
    const { blockingErrors, interceptor } = createTestInterceptor();
    const request = createUnaryConsoleConfigRequest();

    failure.details = [
      {
        debug: {
          reason: "ERROR_REASON_APP_DATABASE_NOT_CONFIGURED",
        },
        type: "google.rpc.ErrorInfo",
        value: new Uint8Array([1]),
      },
    ];

    await expect(
      interceptor(() => Promise.reject(failure))(request)
    ).rejects.toEqual(failure);

    const uiError = blockingErrors[0]?.error;
    expect(uiError?.context.request?.host).toBe("localhost:8080");
    expect(uiError?.context.request?.headers).toEqual({
      "connect-protocol-version": ["1"],
      "content-type": ["application/json"],
    });
    expect(uiError?.context.request?.rpcPath).toBe(
      "querylane.console.v1alpha1.ConsoleService/GetConsoleConfig"
    );
    expect(uiError?.technicalDetailsText).toContain(
      "grpcurl -plaintext -d '{}' localhost:8080 querylane.console.v1alpha1.ConsoleService/GetConsoleConfig"
    );
  });

  it("routes database-not-configured failures to setup flow", async () => {
    const failure = new ConnectError("setup required", Code.FailedPrecondition);
    failure.details = [
      {
        debug: {
          reason: "ERROR_REASON_APP_DATABASE_NOT_CONFIGURED",
        },
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
    ).rejects.toEqual(failure);

    expect(getSetupRequiredCalls()).toBe(1);
    expect(blockingErrors[0]?.error.blockingReason).toBe("setup_required");
    expect(blockingErrors[0]?.returnTo).toBe("/instances/prod-us-east");
  });

  it("routes unauthenticated failures to access blocker flow", async () => {
    const failure = new ConnectError("login required", Code.Unauthenticated);
    failure.details = [
      {
        debug: {
          reason: "ERROR_REASON_UNAUTHENTICATED",
        },
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
    ).rejects.toEqual(failure);

    expect(getSetupRequiredCalls()).toBe(0);
    expect(blockingErrors[0]?.error.blockingReason).toBe("unauthenticated");
  });
});

describe("transport snapshots", () => {
  it("passes through successful calls", async () => {
    const interceptor = createSetupInterceptor({
      getCurrentHref: () => null,
      loadBlockingErrorStore: async () => ({
        useBlockingErrorStore: {
          getState: () => ({ setBlockingError: () => undefined }),
        },
      }),
      logger: createFakeLogger(),
      markSetupRequired: () => undefined,
    });
    const response = createUnaryConsoleConfigResponse();

    await expect(
      interceptor(() => Promise.resolve(response))(
        createUnaryConsoleConfigRequest()
      )
    ).resolves.toBe(response);
  });

  it("captures invalid successful content-type response bodies", async () => {
    const observedFetch = createObservedConnectFetch(
      async () =>
        new Response("not connect", {
          headers: { "content-type": "text/html" },
          status: 200,
        })
    );

    const response = await observedFetch("http://localhost:8080/test");

    expect(
      response.headers.get(CONNECT_ERROR_SNAPSHOT_BODY_HEADER)
    ).toBeTruthy();
    await response.text();
  });

  it("does not snapshot empty, bodyless, or valid connect responses", async () => {
    for (const response of [
      new Response(null, { status: 204 }),
      new Response("", { status: 500 }),
      new Response("{}", {
        headers: { "content-type": "application/connect+json" },
        status: 200,
      }),
    ]) {
      const observedFetch = createObservedConnectFetch(async () => response);
      const observed = await observedFetch("http://localhost:8080/test");
      expect(
        observed.headers.get(CONNECT_ERROR_SNAPSHOT_BODY_HEADER)
      ).toBeNull();
      await observed.text();
    }
  });

  it("preserves empty failed response status for semantic mapping", async () => {
    const observedFetch = createObservedConnectFetch(
      async () => new Response(null, { status: 499 })
    );

    const response = await observedFetch("http://localhost:8080/test");

    expect(response.headers.get(CONNECT_ERROR_SNAPSHOT_STATUS_HEADER)).toBe(
      "499"
    );
  });

  it("uses fetch implementation preconnect when available", () => {
    let preconnectCalls = 0;
    const preconnect = () => {
      preconnectCalls += 1;
    };
    const fakeFetch = Object.assign(
      async () => new Response(null, { status: 204 }),
      { preconnect }
    );

    const observedFetch = createObservedConnectFetch(fakeFetch);

    observedFetch.preconnect?.("https://example.com");
    expect(preconnectCalls).toBe(1);
  });

  it("captures streaming and unserializable request snapshots", async () => {
    const streamFailure = new ConnectError("stream failed", Code.Unknown);
    const unserializableFailure = new ConnectError(
      "bad request",
      Code.InvalidArgument
    );
    const { interceptor } = createTestInterceptor();

    const caughtStreamFailure = await Reflect.apply(
      interceptor(() => Promise.reject(streamFailure)),
      undefined,
      [
        {
          ...createUnaryConsoleConfigRequest(),
          stream: true,
        },
      ]
    ).catch((error: unknown) => error);

    expect(caughtStreamFailure).toBe(streamFailure);
    expect(getAttachedRequestJsonNote(caughtStreamFailure)).toBe(
      STREAMING_INPUT_REQUEST_MESSAGE
    );

    const caughtUnserializableFailure = await Reflect.apply(
      interceptor(() => Promise.reject(unserializableFailure)),
      undefined,
      [
        {
          ...createUnaryConsoleConfigRequest(),
          method: { name: "NoInput" },
        },
      ]
    ).catch((error: unknown) => error);

    expect(caughtUnserializableFailure).toBe(unserializableFailure);
    expect(getAttachedRequestJsonNote(caughtUnserializableFailure)).toBe(
      REQUEST_PAYLOAD_SERIALIZATION_FAILURE_MESSAGE
    );
  });

  it("keeps the original RPC failure when request context capture fails", async () => {
    const failure = new ConnectError("rpc failed", Code.Unavailable);
    const warningCalls: Array<{ message: string; payload: unknown }> = [];
    const logger = {
      ...createFakeLogger(),
      warn: (message: string, payload?: unknown) => {
        warningCalls.push({ message, payload });
      },
    } satisfies SetupInterceptorDependencies["logger"];
    const interceptor = createSetupInterceptor({
      getCurrentHref: () => null,
      loadBlockingErrorStore: async () => ({
        useBlockingErrorStore: {
          getState: () => ({ setBlockingError: () => undefined }),
        },
      }),
      logger,
      markSetupRequired: () => undefined,
    });
    const request = {
      get message(): unknown {
        throw new Error("request context failed");
      },
      method: ConsoleService.method.getConsoleConfig,
      requestMethod: "POST",
      service: ConsoleService,
      stream: false,
      url: "http://localhost:8080/querylane.console.v1alpha1.ConsoleService/GetConsoleConfig",
    };

    await expect(
      Reflect.apply(
        interceptor(() => Promise.reject(failure)),
        undefined,
        [request]
      )
    ).rejects.toBe(failure);

    expect(warningCalls).toEqual([
      {
        message: "Failed to build API error request context",
        payload: {
          endpoint:
            "querylane.console.v1alpha1.ConsoleService/GetConsoleConfig",
          error: expect.any(Error),
        },
      },
    ]);
  });
});
