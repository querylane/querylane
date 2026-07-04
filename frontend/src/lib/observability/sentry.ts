import type { Scope, Span } from "@sentry/react";

import { env as typedEnv } from "@/env";

type SentryModule = typeof import("@sentry/react");
type SentryInitOptions = Parameters<SentryModule["init"]>[0];
type SentryDataCollection = NonNullable<SentryInitOptions["dataCollection"]>;
type SentryTracePropagationTarget = NonNullable<
  SentryInitOptions["tracePropagationTargets"]
>[number];

const DEFAULT_TRACES_SAMPLE_RATE = 0.02;
const DEFAULT_REPLAYS_SESSION_SAMPLE_RATE = 0.1;
const DEFAULT_REPLAYS_ON_ERROR_SAMPLE_RATE = 1;
const SENTRY_APPLICATION_KEY = "querylane-frontend";
const SENTRY_GEN_AI_DATA_COLLECTION_KEY = "genAI";
const RELATIVE_SAME_ORIGIN_TRACE_PROPAGATION_TARGET = /^\/(?!\/)/;

function getRuntimeEnv(): Record<string, string | undefined> {
  return typedEnv;
}

interface SentryRuntimeConfig {
  dataCollection: SentryDataCollection;
  dsn: string;
  enableConsoleLoggingIntegration: boolean;
  enabled: boolean;
  enableLogs: boolean;
  environment?: string | undefined;
  release?: string | undefined;
  replaysOnErrorSampleRate: number;
  replaysSessionSampleRate: number;
  tracePropagationTargets: SentryTracePropagationTarget[];
  tracesSampleRate: number;
}

interface ResolveSentryRuntimeConfigOptions {
  env: Record<string, string | undefined>;
  isProd: boolean;
  locationOrigin?: string | undefined;
}

interface CaptureExceptionContext {
  extras?: Record<string, unknown> | undefined;
  tags?: Record<string, string> | undefined;
}

type SentryStartSpanOptions = Parameters<SentryModule["startSpan"]>[0];
// Narrow span surface handed to startSpan callbacks. Declared with method
// syntax (bivariant) so the real Sentry Span stays assignable even though its
// setAttribute accepts the wider SpanAttributeValue and returns this.
interface TelemetrySpan {
  setAttribute(
    key: string,
    value: string | number | boolean | undefined
  ): unknown;
}
type SentryLogger = SentryModule["logger"];

interface SentryClientLike {
  browserTracingIntegration: () => unknown;
  captureException: (error: unknown) => string;
  consoleLoggingIntegration: SentryModule["consoleLoggingIntegration"];
  init: (options: Record<string, unknown>) => void;
  logger: SentryLogger;
  replayIntegration: () => unknown;
  setTag: (key: string, value: string) => void;
  startSpan: <T>(
    options: SentryStartSpanOptions,
    callback: (span: Span) => T
  ) => T;
  thirdPartyErrorFilterIntegration: SentryModule["thirdPartyErrorFilterIntegration"];
  withScope: (callback: (scope: Scope) => void) => void;
}

function resolveSentryRuntimeConfig({
  env,
  isProd,
  locationOrigin = getCurrentLocationOrigin(),
}: ResolveSentryRuntimeConfigOptions): SentryRuntimeConfig {
  const dsn = env["PUBLIC_SENTRY_DSN"]?.trim() ?? "";

  return {
    dataCollection: createSentryDataCollectionConfig(),
    dsn,
    enableConsoleLoggingIntegration: parseBooleanEnv(
      env["PUBLIC_SENTRY_ENABLE_CONSOLE_LOG_INTEGRATION"]
    ),
    enabled: isProd && dsn.length > 0,
    enableLogs: parseBooleanEnv(env["PUBLIC_SENTRY_ENABLE_LOGS"]),
    environment: env["PUBLIC_SENTRY_ENVIRONMENT"],
    release: env["PUBLIC_SENTRY_RELEASE"],
    replaysOnErrorSampleRate: parseSampleRate(
      env["PUBLIC_SENTRY_REPLAYS_ON_ERROR_SAMPLE_RATE"],
      DEFAULT_REPLAYS_ON_ERROR_SAMPLE_RATE
    ),
    replaysSessionSampleRate: parseSampleRate(
      env["PUBLIC_SENTRY_REPLAYS_SESSION_SAMPLE_RATE"],
      DEFAULT_REPLAYS_SESSION_SAMPLE_RATE
    ),
    tracePropagationTargets: createTracePropagationTargets(
      env["PUBLIC_API_BASE_URL"],
      locationOrigin
    ),
    tracesSampleRate: parseSampleRate(
      env["PUBLIC_SENTRY_TRACES_SAMPLE_RATE"],
      DEFAULT_TRACES_SAMPLE_RATE
    ),
  };
}

function createTracePropagationTargets(
  apiBaseUrl: string | undefined,
  locationOrigin: string | undefined
): SentryTracePropagationTarget[] {
  const targets: SentryTracePropagationTarget[] = [
    RELATIVE_SAME_ORIGIN_TRACE_PROPAGATION_TARGET,
  ];
  if (locationOrigin && locationOrigin !== "null") {
    targets.push(locationOrigin);
  }
  const trimmedApiBaseUrl = apiBaseUrl?.trim();
  if (!trimmedApiBaseUrl) {
    return targets;
  }

  try {
    targets.push(new URL(trimmedApiBaseUrl).origin);
  } catch {
    // Relative API URLs are already covered by the same-origin regexp above.
  }

  return targets;
}

function getCurrentLocationOrigin() {
  return typeof globalThis.location?.origin === "string"
    ? globalThis.location.origin
    : undefined;
}

function createSentryDataCollectionConfig(): SentryDataCollection {
  return {
    cookies: false,
    frameContextLines: 5,
    [SENTRY_GEN_AI_DATA_COLLECTION_KEY]: {
      inputs: false,
      outputs: false,
    },
    httpBodies: [],
    httpHeaders: {
      request: {
        deny: ["authorization", "cookie", "x-api-key"],
      },
      response: false,
    },
    queryParams: {
      deny: ["password", "token", "secret", "key"],
    },
    stackFrameVariables: true,
    userInfo: false,
  };
}

function parseBooleanEnv(rawValue: string | undefined): boolean {
  return rawValue === "1";
}

function parseSampleRate(
  rawValue: string | undefined,
  fallback: number
): number {
  if (typeof rawValue !== "string") {
    return fallback;
  }

  const value = Number.parseFloat(rawValue);
  if (!Number.isFinite(value) || value < 0 || value > 1) {
    return fallback;
  }

  return value;
}

function createNoopSpan(): TelemetrySpan {
  return {
    setAttribute: () => undefined,
  };
}

function createNoopLogger(): SentryLogger {
  const log = () => undefined;
  return {
    debug: log,
    error: log,
    fatal: log,
    fmt: (
      strings: TemplateStringsArray | ArrayLike<string>,
      ...values: unknown[]
    ) =>
      Array.from(strings).reduce(
        (result, part, index) => result + part + String(values[index] ?? ""),
        ""
      ),
    info: log,
    trace: log,
    warn: log,
  } as SentryLogger;
}

function createObservabilityApi(
  client: SentryClientLike,
  config: SentryRuntimeConfig
) {
  let initialized = false;

  return {
    captureException(error: unknown, context?: CaptureExceptionContext) {
      if (!config.enabled) {
        return;
      }

      if (!(context?.tags || context?.extras)) {
        client.captureException(error);
        return;
      }

      client.withScope((scope: Scope) => {
        if (context.tags) {
          for (const [key, value] of Object.entries(context.tags)) {
            scope.setTag(key, value);
          }
        }

        if (context.extras) {
          for (const [key, value] of Object.entries(context.extras)) {
            scope.setExtra(key, value);
          }
        }

        client.captureException(error);
      });
    },
    config,
    init() {
      if (initialized || !config.enabled) {
        return;
      }

      const integrations: unknown[] = [
        client.browserTracingIntegration(),
        client.thirdPartyErrorFilterIntegration({
          behaviour: "apply-tag-if-exclusively-contains-third-party-frames",
          filterKeys: [SENTRY_APPLICATION_KEY],
          ignoreSentryInternalFrames: true,
        }),
      ];
      if (
        config.replaysSessionSampleRate > 0 ||
        config.replaysOnErrorSampleRate > 0
      ) {
        integrations.push(client.replayIntegration());
      }
      if (config.enableConsoleLoggingIntegration) {
        integrations.push(
          client.consoleLoggingIntegration({
            levels: ["log", "warn", "error"],
          })
        );
      }

      client.init({
        dataCollection: config.dataCollection,
        dsn: config.dsn,
        enableLogs: config.enableLogs,
        environment: config.environment,
        integrations,
        release: config.release,
        replaysOnErrorSampleRate: config.replaysOnErrorSampleRate,
        replaysSessionSampleRate: config.replaysSessionSampleRate,
        sendDefaultPii: false,
        tracePropagationTargets: config.tracePropagationTargets,
        tracesSampleRate: config.tracesSampleRate,
      });

      initialized = true;
    },
    isEnabled() {
      return config.enabled;
    },
    logger: client.logger,
    setTag(key: string, value: string) {
      if (!config.enabled) {
        return;
      }

      client.setTag(key, value);
    },
    startSpan<T>(
      options: SentryStartSpanOptions,
      callback: (span: TelemetrySpan) => T
    ): T {
      if (!config.enabled) {
        return callback(createNoopSpan());
      }

      return client.startSpan(options, callback);
    },
  };
}

const runtimeConfig = resolveSentryRuntimeConfig({
  env: getRuntimeEnv(),
  isProd: import.meta.env.PROD,
});

let sentryClientPromise: Promise<SentryClientLike> | undefined;
let loadedSentryClient: SentryClientLike | undefined;

function loadSentryClient(): Promise<SentryClientLike> {
  sentryClientPromise ??= import("@sentry/react").then((sentry) => {
    const client: SentryClientLike = {
      browserTracingIntegration: sentry.browserTracingIntegration,
      captureException: sentry.captureException,
      consoleLoggingIntegration: sentry.consoleLoggingIntegration,
      init: sentry.init,
      logger: sentry.logger,
      replayIntegration: sentry.replayIntegration,
      setTag: sentry.setTag,
      startSpan: sentry.startSpan,
      thirdPartyErrorFilterIntegration: sentry.thirdPartyErrorFilterIntegration,
      withScope: sentry.withScope,
    };
    loadedSentryClient = client;
    return client;
  });

  return sentryClientPromise;
}

function reportLazyLoadFailure(_error: unknown) {
  return;
}

function createLazyRuntimeObservabilityApi(config: SentryRuntimeConfig) {
  let initialized = false;
  const noopLogger = createNoopLogger();

  return {
    captureException(error: unknown, context?: CaptureExceptionContext) {
      if (!config.enabled) {
        return;
      }

      loadSentryClient()
        .then((client) => {
          createObservabilityApi(client, config).captureException(
            error,
            context
          );
        })
        .catch(reportLazyLoadFailure);
    },
    config,
    init() {
      if (initialized || !config.enabled) {
        return;
      }
      initialized = true;

      loadSentryClient()
        .then((client) => createObservabilityApi(client, config).init())
        .catch(reportLazyLoadFailure);
    },
    isEnabled() {
      return config.enabled;
    },
    logger: noopLogger,
    setTag(key: string, value: string) {
      if (!config.enabled) {
        return;
      }

      if (loadedSentryClient) {
        loadedSentryClient.setTag(key, value);
        return;
      }

      loadSentryClient()
        .then((client) => client.setTag(key, value))
        .catch(reportLazyLoadFailure);
    },
    startSpan<T>(
      options: SentryStartSpanOptions,
      callback: (span: TelemetrySpan) => T
    ): T {
      if (!(config.enabled && loadedSentryClient)) {
        return callback(createNoopSpan());
      }

      return loadedSentryClient.startSpan(options, callback);
    },
  };
}

const runtimeObservability = createLazyRuntimeObservabilityApi(runtimeConfig);

const sentryConfig = runtimeObservability.config;
const logger = runtimeObservability.logger;
const initSentry = runtimeObservability.init;
const captureException = runtimeObservability.captureException;
const startSpan = runtimeObservability.startSpan;
const setSentryTag = runtimeObservability.setTag;

export type { SentryRuntimeConfig };
export {
  captureException,
  createObservabilityApi,
  initSentry,
  logger,
  resolveSentryRuntimeConfig,
  sentryConfig,
  setSentryTag,
  startSpan,
};
