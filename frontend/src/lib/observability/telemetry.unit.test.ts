import { afterEach, describe, expect, it, vi } from "vitest";

import {
  createTelemetryApi,
  isSentryIntegration,
} from "@/lib/observability/telemetry";

type TelemetryDependencies = NonNullable<
  Parameters<typeof createTelemetryApi>[0]
>;

function createTelemetryDependencies(
  overrides: Partial<TelemetryDependencies> = {}
) {
  const order: string[] = [];
  const tags: Record<string, string> = {};
  const integrations: unknown[] = [];
  let sessionListener: ((sessionId: string, windowId: string) => void) | null =
    null;

  const dependencies: TelemetryDependencies = {
    addSentryIntegration: (integration: unknown) => {
      integrations.push(integration);
      order.push("addSentryIntegration");
    },
    getPostHogSentryIntegration: async () => ({ type: "posthog-sentry" }),
    getPostHogSessionId: () => "session-123",
    initPostHog: () => {
      order.push("initPostHog");
    },
    initSentry: () => {
      order.push("initSentry");
    },
    isPostHogEnabled: () => true,
    isSentryEnabled: () => true,
    onPostHogSessionId: (
      callback: (sessionId: string, windowId: string) => void
    ) => {
      sessionListener = callback;
      order.push("on posthog session id");
      return () => undefined;
    },
    setSentryTag: (key: string, value: string) => {
      tags[key] = value;
      order.push(`setSentryTag:${key}`);
    },
    ...overrides,
  };

  return {
    dependencies,
    integrations,
    order,
    tags,
    triggerSessionId(sessionId: string) {
      sessionListener?.(sessionId, "window-1");
    },
  };
}

describe("telemetry api", () => {
  it("initializes Sentry before PostHog and attaches integration once", async () => {
    const { dependencies, integrations, order, tags } =
      createTelemetryDependencies();
    const api = createTelemetryApi(dependencies);

    await api.init();
    api.init();

    expect(order.slice(0, 2)).toEqual(["initSentry", "initPostHog"]);
    expect(integrations).toHaveLength(1);
    expect(tags["posthog_session_id"]).toBe("session-123");
  });

  it("updates Sentry session tag from PostHog session callbacks", async () => {
    const { dependencies, tags, triggerSessionId } =
      createTelemetryDependencies();
    const api = createTelemetryApi(dependencies);

    await api.init();
    triggerSessionId("session-456");

    expect(tags["posthog_session_id"]).toBe("session-456");
  });

  it("skips integration setup when either provider is disabled", async () => {
    const { dependencies, integrations, tags } = createTelemetryDependencies({
      isPostHogEnabled: () => false,
    });
    const api = createTelemetryApi(dependencies);

    await api.init();

    expect(integrations).toHaveLength(0);
    expect(tags["posthog_session_id"]).toBeUndefined();
  });

  it("does not set blank PostHog session ids and ignores missing integration", async () => {
    const { dependencies, integrations, tags, triggerSessionId } =
      createTelemetryDependencies({
        getPostHogSentryIntegration: async () => undefined,
        getPostHogSessionId: () => "  ",
      });
    const api = createTelemetryApi(dependencies);

    await api.init();
    triggerSessionId("   ");

    expect(integrations).toEqual([]);
    expect(tags["posthog_session_id"]).toBeUndefined();
  });

  it("swallows PostHog integration lookup failures", async () => {
    const { dependencies, integrations } = createTelemetryDependencies({
      getPostHogSentryIntegration: () =>
        Promise.reject(new Error("posthog unavailable")),
    });
    const api = createTelemetryApi(dependencies);

    await expect(api.init()).resolves.toBeUndefined();
    expect(integrations).toEqual([]);
  });
});

describe("runtime telemetry api", () => {
  afterEach(() => {
    vi.unstubAllEnvs();
    vi.doUnmock("@/lib/observability/posthog");
    vi.doUnmock("@/lib/observability/sentry");
    vi.doUnmock("@sentry/react");
  });

  it("wires default telemetry providers and registers the PostHog Sentry integration", async () => {
    vi.resetModules();
    const order: string[] = [];
    const tags: Record<string, string> = {};
    const integration = { name: "posthog-sentry" };
    const addIntegration = vi.fn();

    vi.doMock("@/lib/observability/posthog", () => ({
      getPostHogSentryIntegration: async () => integration,
      getPostHogSessionId: () => " session-runtime ",
      initPostHog: () => order.push("posthog"),
      isPostHogEnabled: () => true,
      onPostHogSessionId: (callback: (sessionId: string) => void) => {
        callback(" session-callback ");
        return () => undefined;
      },
    }));
    vi.doMock("@/lib/observability/sentry", () => ({
      initSentry: () => order.push("sentry"),
      sentryConfig: { enabled: true },
      setSentryTag: (key: string, value: string) => {
        tags[key] = value;
      },
    }));
    vi.doMock("@sentry/react", () => ({ addIntegration }));

    const runtime = await import("@/lib/observability/telemetry");

    await runtime.initTelemetry();

    expect(order).toEqual(["sentry", "posthog"]);
    await vi.waitFor(() => {
      expect(addIntegration).toHaveBeenCalledWith(integration);
    });
    expect(tags["posthog_session_id"]).toBe("session-callback");
  });
});

describe("isSentryIntegration", () => {
  it("accepts objects with a string name", () => {
    expect(isSentryIntegration({ name: "posthog-js" })).toBe(true);
  });

  it("rejects values without a string name", () => {
    expect(isSentryIntegration(undefined)).toBe(false);
    expect(isSentryIntegration(null)).toBe(false);
    expect(isSentryIntegration("posthog-js")).toBe(false);
    expect(isSentryIntegration({ kind: "not-an-integration" })).toBe(false);
    expect(isSentryIntegration({ name: 42 })).toBe(false);
  });
});
