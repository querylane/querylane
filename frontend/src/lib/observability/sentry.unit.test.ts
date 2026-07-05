import { afterEach, describe, expect, it, vi } from "vitest";

import {
  createObservabilityApi,
  resolveSentryRuntimeConfig,
  type SentryRuntimeConfig,
} from "@/lib/observability/sentry";

type ObservabilityClient = Parameters<typeof createObservabilityApi>[0];
const EXPECTED_INIT_INTEGRATIONS_COUNT = 4;
const EXPECTED_INIT_REPLAYS_SESSION_SAMPLE_RATE = 0.1;
const EXPECTED_INIT_TRACES_SAMPLE_RATE = 0.25;
const EXPECTED_NON_PROD_REPLAYS_SESSION_SAMPLE_RATE = 0.1;
const EXPECTED_NON_PROD_TRACES_SAMPLE_RATE = 0.02;
const EXPECTED_NO_REPLAY_INTEGRATIONS_COUNT = 3;
const EXPECTED_PROD_REPLAYS_ON_ERROR_SAMPLE_RATE = 0.9;
const EXPECTED_PROD_REPLAYS_SESSION_SAMPLE_RATE = 0.3;
const EXPECTED_PROD_TRACES_SAMPLE_RATE = 0.45;
const SENTRY_GEN_AI_DATA_COLLECTION_KEY = "genAI";
const RELATIVE_SAME_ORIGIN_TRACE_PROPAGATION_TARGET = /^\/(?!\/)/;

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

interface FakeSentryState {
  captureCalls: unknown[];
  globalTags: Record<string, string>;
  initCalls: Record<string, unknown>[];
  scopeCalls: Array<{
    extras: Record<string, unknown>;
    tags: Record<string, string>;
  }>;
  spanCalls: unknown[];
}

function createFakeSentry() {
  const state: FakeSentryState = {
    captureCalls: [],
    globalTags: {},
    initCalls: [],
    scopeCalls: [],
    spanCalls: [],
  };

  const fakeSentry = {
    browserTracingIntegration: () => ({ type: "browser-tracing" }),
    captureException: (error: unknown) => {
      state.captureCalls.push(error);
      return "event-id";
    },
    consoleLoggingIntegration: (options = { levels: [] }) => ({
      options,
      type: "console-logging",
    }),
    init: (options: Record<string, unknown>) => {
      state.initCalls.push(options);
    },
    logger: createFakeLogger(),
    replayIntegration: () => ({ type: "replay" }),
    setTag: (key: string, value: string) => {
      state.globalTags[key] = value;
    },
    startSpan: <T>(
      options: Parameters<ObservabilityClient["startSpan"]>[0],
      callback: (span: {
        setAttribute: (
          key: string,
          value: boolean | number | string | undefined
        ) => unknown;
      }) => T
    ) => {
      state.spanCalls.push(options);
      return callback({
        setAttribute: () => undefined,
      });
    },
    thirdPartyErrorFilterIntegration: (
      options: Parameters<
        ObservabilityClient["thirdPartyErrorFilterIntegration"]
      >[0]
    ) => ({
      options,
      type: "third-party-error-filter",
    }),
    withScope: (
      callback: (scope: {
        setExtra: (key: string, value: unknown) => void;
        setTag: (key: string, value: string) => void;
      }) => void
    ) => {
      const tags: Record<string, string> = {};
      const extras: Record<string, unknown> = {};
      callback({
        setExtra: (key, value) => {
          extras[key] = value;
        },
        setTag: (key, value) => {
          tags[key] = value;
        },
      });
      state.scopeCalls.push({ extras, tags });
    },
  } satisfies ObservabilityClient;

  return { fakeSentry, state };
}

function createSentryDataCollectionExpectation() {
  return {
    cookies: false,
    frameContextLines: 5,
    [SENTRY_GEN_AI_DATA_COLLECTION_KEY]: { inputs: false, outputs: false },
    httpBodies: [],
    httpHeaders: {
      request: { deny: ["authorization", "cookie", "x-api-key"] },
      response: false,
    },
    queryParams: { deny: ["password", "token", "secret", "key"] },
    stackFrameVariables: true,
    userInfo: false,
  };
}

function createEnabledConfig(): SentryRuntimeConfig {
  return {
    dataCollection: createSentryDataCollectionExpectation(),
    dsn: "https://sentry.example/dsn",
    enableConsoleLoggingIntegration: true,
    enabled: true,
    enableLogs: true,
    environment: "production",
    release: "abc123",
    replaysOnErrorSampleRate: 1,
    replaysSessionSampleRate: 0.1,
    tracePropagationTargets: [RELATIVE_SAME_ORIGIN_TRACE_PROPAGATION_TARGET],
    tracesSampleRate: 0.25,
  };
}

describe("sentry runtime config", () => {
  it("enables Sentry only in production with a DSN and parses env flags", () => {
    const config = resolveSentryRuntimeConfig({
      env: {
        PUBLIC_API_BASE_URL: "https://api.querylane.test/v1",
        PUBLIC_SENTRY_DSN: "https://dsn-value",
        PUBLIC_SENTRY_ENABLE_CONSOLE_LOG_INTEGRATION: "1",
        PUBLIC_SENTRY_ENABLE_LOGS: "1",
        PUBLIC_SENTRY_ENVIRONMENT: "production",
        PUBLIC_SENTRY_RELEASE: "release-1",
        PUBLIC_SENTRY_REPLAYS_ON_ERROR_SAMPLE_RATE: "0.9",
        PUBLIC_SENTRY_REPLAYS_SESSION_SAMPLE_RATE: "0.3",
        PUBLIC_SENTRY_TRACES_SAMPLE_RATE: "0.45",
      },
      isProd: true,
      locationOrigin: "https://querylane.test",
    });

    expect(config.enabled).toBe(true);
    expect(config.dsn).toBe("https://dsn-value");
    expect(config.enableLogs).toBe(true);
    expect(config.enableConsoleLoggingIntegration).toBe(true);
    expect(config.tracesSampleRate).toBe(EXPECTED_PROD_TRACES_SAMPLE_RATE);
    expect(config.replaysSessionSampleRate).toBe(
      EXPECTED_PROD_REPLAYS_SESSION_SAMPLE_RATE
    );
    expect(config.replaysOnErrorSampleRate).toBe(
      EXPECTED_PROD_REPLAYS_ON_ERROR_SAMPLE_RATE
    );
    expect(config.tracePropagationTargets).toEqual([
      RELATIVE_SAME_ORIGIN_TRACE_PROPAGATION_TARGET,
      "https://querylane.test",
      "https://api.querylane.test",
    ]);
    expect(config.environment).toBe("production");
    expect(config.release).toBe("release-1");
  });

  it("uses explicit privacy-preserving data collection defaults", () => {
    const config = resolveSentryRuntimeConfig({
      env: { PUBLIC_SENTRY_DSN: "https://dsn-value" },
      isProd: true,
    });

    expect(config.dataCollection).toEqual(
      createSentryDataCollectionExpectation()
    );
  });

  it("traces absolute same-origin requests without tracing opaque origins", () => {
    const absoluteSameOriginConfig = resolveSentryRuntimeConfig({
      env: { PUBLIC_SENTRY_DSN: "https://dsn-value" },
      isProd: true,
      locationOrigin: "https://app.querylane.test",
    });
    expect(absoluteSameOriginConfig.tracePropagationTargets).toEqual([
      RELATIVE_SAME_ORIGIN_TRACE_PROPAGATION_TARGET,
      "https://app.querylane.test",
    ]);

    const opaqueOriginConfig = resolveSentryRuntimeConfig({
      env: { PUBLIC_SENTRY_DSN: "https://dsn-value" },
      isProd: true,
      locationOrigin: "null",
    });
    expect(opaqueOriginConfig.tracePropagationTargets).toEqual([
      RELATIVE_SAME_ORIGIN_TRACE_PROPAGATION_TARGET,
    ]);
  });

  it("falls back to defaults when sample rate is invalid and disables in non-prod", () => {
    const config = resolveSentryRuntimeConfig({
      env: {
        PUBLIC_SENTRY_DSN: "https://dsn-value",
        PUBLIC_SENTRY_REPLAYS_ON_ERROR_SAMPLE_RATE: "-1",
        PUBLIC_SENTRY_REPLAYS_SESSION_SAMPLE_RATE: "invalid",
        PUBLIC_SENTRY_TRACES_SAMPLE_RATE: "1.75",
      },
      isProd: false,
    });

    expect(config.enabled).toBe(false);
    expect(config.tracesSampleRate).toBe(EXPECTED_NON_PROD_TRACES_SAMPLE_RATE);
    expect(config.replaysSessionSampleRate).toBe(
      EXPECTED_NON_PROD_REPLAYS_SESSION_SAMPLE_RATE
    );
    expect(config.replaysOnErrorSampleRate).toBe(1);
  });
});

describe("createObservabilityApi", () => {
  it("initializes Sentry with expected options and only once", () => {
    const { fakeSentry, state } = createFakeSentry();
    const api = createObservabilityApi(fakeSentry, createEnabledConfig());

    api.init();
    api.init();

    expect(state.initCalls.length).toBe(1);
    expect(state.initCalls[0]?.["sendDefaultPii"]).toBe(false);
    expect(state.initCalls[0]?.["dataCollection"]).toEqual(
      createSentryDataCollectionExpectation()
    );
    expect(state.initCalls[0]?.["enableLogs"]).toBe(true);
    expect(state.initCalls[0]?.["tracesSampleRate"]).toBe(
      EXPECTED_INIT_TRACES_SAMPLE_RATE
    );
    expect(state.initCalls[0]?.["replaysSessionSampleRate"]).toBe(
      EXPECTED_INIT_REPLAYS_SESSION_SAMPLE_RATE
    );
    expect(state.initCalls[0]?.["replaysOnErrorSampleRate"]).toBe(1);
    expect(state.initCalls[0]?.["tracePropagationTargets"]).toEqual([
      RELATIVE_SAME_ORIGIN_TRACE_PROPAGATION_TARGET,
    ]);
    expect(Array.isArray(state.initCalls[0]?.["integrations"])).toBe(true);
    const integrations = state.initCalls[0]?.["integrations"] as Array<{
      options?: Record<string, unknown>;
      type?: string;
    }>;
    expect(integrations.length).toBe(EXPECTED_INIT_INTEGRATIONS_COUNT);
    expect(
      integrations.find(
        (integration) => integration.type === "third-party-error-filter"
      )?.options
    ).toEqual({
      behaviour: "apply-tag-if-exclusively-contains-third-party-frames",
      filterKeys: ["querylane-frontend"],
      ignoreSentryInternalFrames: true,
    });
  });

  it("captures exceptions with tags and extras via scope", () => {
    const { fakeSentry, state } = createFakeSentry();
    const api = createObservabilityApi(fakeSentry, createEnabledConfig());
    const error = new Error("boom");

    api.captureException(error, {
      extras: { retry: 2 },
      tags: { area: "unit-test" },
    });

    expect(state.captureCalls.length).toBe(1);
    expect(state.captureCalls[0]).toBe(error);
    expect(state.scopeCalls.length).toBe(1);
    expect(state.scopeCalls[0]?.tags["area"]).toBe("unit-test");
    expect(state.scopeCalls[0]?.extras["retry"]).toBe(2);
  });

  it("does not install replay integration when both replay sample rates are zero", () => {
    const { fakeSentry, state } = createFakeSentry();
    const api = createObservabilityApi(fakeSentry, {
      ...createEnabledConfig(),
      replaysOnErrorSampleRate: 0,
      replaysSessionSampleRate: 0,
    });

    api.init();

    expect(Array.isArray(state.initCalls[0]?.["integrations"])).toBe(true);
    expect((state.initCalls[0]?.["integrations"] as unknown[]).length).toBe(
      EXPECTED_NO_REPLAY_INTEGRATIONS_COUNT
    );
  });

  it("executes span callback without calling Sentry when disabled", () => {
    const { fakeSentry, state } = createFakeSentry();
    const api = createObservabilityApi(fakeSentry, {
      ...createEnabledConfig(),
      enabled: false,
    });

    const result = api.startSpan(
      {
        name: "No-op span",
        op: "unit",
      },
      (span) => {
        span.setAttribute("status", "ok");
        return "done";
      }
    );

    expect(result).toBe("done");
    expect(state.spanCalls.length).toBe(0);
  });

  it("sets global tags when enabled", () => {
    const { fakeSentry, state } = createFakeSentry();
    const api = createObservabilityApi(fakeSentry, createEnabledConfig());

    api.setTag("posthog_session_id", "session-123");

    expect(state.globalTags["posthog_session_id"]).toBe("session-123");
  });
});

describe("runtime sentry api", () => {
  afterEach(() => {
    vi.unstubAllEnvs();
    vi.doUnmock("@sentry/react");
  });

  it("lazy-loads, initializes, tags, captures, and spans when enabled", async () => {
    vi.resetModules();
    vi.stubEnv("PROD", true);
    vi.stubEnv("PUBLIC_SENTRY_DSN", "https://runtime-dsn");
    vi.stubEnv("PUBLIC_SENTRY_ENABLE_LOGS", "1");

    const { fakeSentry, state } = createFakeSentry();
    vi.doMock("@sentry/react", () => fakeSentry);

    const runtime = await import("@/lib/observability/sentry");

    runtime.initSentry();
    await vi.waitFor(() => {
      expect(state.initCalls).toHaveLength(1);
    });
    runtime.setSentryTag("area", "runtime");
    runtime.captureException(new Error("boom"));
    await vi.waitFor(() => {
      expect(state.captureCalls).toHaveLength(1);
    });

    const spanResult = runtime.startSpan(
      { name: "runtime", op: "unit" },
      () => "span-result"
    );

    expect(runtime.sentryConfig.enabled).toBe(true);
    expect(state.initCalls).toHaveLength(1);
    expect(state.globalTags["area"]).toBe("runtime");
    expect(state.captureCalls).toHaveLength(1);
    expect(spanResult).toBe("span-result");
    expect(state.spanCalls).toEqual([{ name: "runtime", op: "unit" }]);
  });

  it("uses noop runtime behavior when disabled", async () => {
    vi.resetModules();
    vi.stubEnv("PROD", false);
    vi.stubEnv("PUBLIC_SENTRY_DSN", "");

    const runtime = await import("@/lib/observability/sentry");
    const messages: string[] = [];

    runtime.initSentry();
    runtime.captureException(new Error("ignored"));
    runtime.setSentryTag("area", "ignored");
    runtime.logger.info("ignored");
    messages.push(runtime.logger.fmt`hello ${"world"}`);

    expect(runtime.sentryConfig.enabled).toBe(false);
    expect(runtime.startSpan({ name: "noop" }, () => "done")).toBe("done");
    expect(messages).toEqual(["hello world"]);
  });
});
