import { afterEach, describe, expect, it, vi } from "vitest";

import {
  createPostHogApi,
  type PostHogRuntimeConfig,
  resolvePostHogRuntimeConfig,
} from "@/lib/observability/posthog";

type PostHogClient = Parameters<typeof createPostHogApi>[0];

interface FakePostHogState {
  captureCalls: Array<{
    eventName: string;
    properties: Parameters<PostHogClient["capture"]>[1];
  }>;
  initCalls: Array<{
    config: Parameters<PostHogClient["init"]>[1];
    token: string;
  }>;
  sessionListeners: Array<(sessionId: string, windowId: string) => void>;
}

function createFakePostHog() {
  const state: FakePostHogState = {
    captureCalls: [],
    initCalls: [],
    sessionListeners: [],
  };

  const fakePostHog: PostHogClient = {
    capture: (
      eventName: string,
      properties?: Parameters<PostHogClient["capture"]>[1]
    ) => {
      state.captureCalls.push({ eventName, properties });
      return;
    },
    get_session_id: () => "session-123",
    getFeatureFlag: () => "variant-a",
    getFeatureFlagResult: (key: string) => ({
      enabled: true,
      key,
      payload: {
        bucket: "A",
      },
      variant: "variant-a",
    }),
    init: (token: string, config?: Parameters<PostHogClient["init"]>[1]) => {
      state.initCalls.push({ config, token });
    },
    isFeatureEnabled: () => true,
    onSessionId: (callback: (sessionId: string, windowId: string) => void) => {
      state.sessionListeners.push(callback);
      return () => undefined;
    },
    sentryIntegration: () => ({ type: "posthog-sentry" }),
  };

  return { fakePostHog, state };
}

function createEnabledConfig(): PostHogRuntimeConfig {
  return {
    apiHost: "https://us.i.posthog.com",
    apiKey: "phc_key",
    enabled: true,
  };
}

describe("posthog runtime config", () => {
  it("enables PostHog only in production with a key", () => {
    const config = resolvePostHogRuntimeConfig({
      env: {
        PUBLIC_POSTHOG_HOST: "https://eu.i.posthog.com",
        PUBLIC_POSTHOG_KEY: "phc_key",
      },
      isProd: true,
    });

    expect(config.enabled).toBe(true);
    expect(config.apiHost).toBe("https://eu.i.posthog.com");
    expect(config.apiKey).toBe("phc_key");
  });

  it("disables PostHog when key is missing or env is non-production", () => {
    const missingKeyConfig = resolvePostHogRuntimeConfig({
      env: {
        PUBLIC_POSTHOG_HOST: "https://us.i.posthog.com",
      },
      isProd: true,
    });
    const nonProdConfig = resolvePostHogRuntimeConfig({
      env: {
        PUBLIC_POSTHOG_KEY: "phc_key",
      },
      isProd: false,
    });

    expect(missingKeyConfig.enabled).toBe(false);
    expect(nonProdConfig.enabled).toBe(false);
  });
});

describe("posthog api", () => {
  it("initializes PostHog once with strict defaults", () => {
    const { fakePostHog, state } = createFakePostHog();
    const api = createPostHogApi(fakePostHog, createEnabledConfig());

    api.init();
    api.init();

    expect(state.initCalls.length).toBe(1);
    expect(state.initCalls[0]?.token).toBe("phc_key");
    expect(state.initCalls[0]?.config?.capture_pageview).toBe(false);
    expect(state.initCalls[0]?.config?.capture_pageleave).toBe(false);
    expect(state.initCalls[0]?.config?.disable_session_recording).toBe(true);
    expect(state.initCalls[0]?.config?.defaults).toBe("2026-05-30");
  });

  it("captures events only when enabled", () => {
    const { fakePostHog, state } = createFakePostHog();
    const enabledApi = createPostHogApi(fakePostHog, createEnabledConfig());
    const disabledApi = createPostHogApi(fakePostHog, {
      ...createEnabledConfig(),
      enabled: false,
    });

    enabledApi.capture("test_event", {
      value: 1,
    });
    disabledApi.capture("ignored_event");

    expect(state.captureCalls.length).toBe(1);
    expect(state.captureCalls[0]?.eventName).toBe("test_event");
  });

  it("returns feature flags, payloads, session ids, and integrations when enabled", () => {
    const { fakePostHog, state } = createFakePostHog();
    const api = createPostHogApi(fakePostHog, createEnabledConfig());
    const unsubscribe = api.onSessionId(() => undefined);

    expect(api.isEnabled()).toBe(true);
    expect(api.getFeatureFlag("checkout-copy")).toBe("variant-a");
    expect(api.getFeatureFlagPayload("checkout-copy")).toEqual({ bucket: "A" });
    expect(api.getFeatureFlagResult("checkout-copy")).toMatchObject({
      enabled: true,
      key: "checkout-copy",
      variant: "variant-a",
    });
    expect(api.isFeatureEnabled("checkout-copy")).toBe(true);
    expect(api.getSessionId()).toBe("session-123");
    expect(api.getSentryIntegration()).toEqual({ type: "posthog-sentry" });
    expect(state.sessionListeners.length).toBe(1);
    expect(unsubscribe()).toBeUndefined();
  });

  it("noops product analytics reads and writes when disabled", () => {
    const { fakePostHog, state } = createFakePostHog();
    const api = createPostHogApi(fakePostHog, {
      ...createEnabledConfig(),
      enabled: false,
    });
    const unsubscribe = api.onSessionId(() => undefined);

    api.init();
    api.capture("ignored_event");

    expect(api.isEnabled()).toBe(false);
    expect(api.getFeatureFlag("flag")).toBeUndefined();
    expect(api.getFeatureFlagPayload("flag")).toBeUndefined();
    expect(api.getFeatureFlagResult("flag")).toBeUndefined();
    expect(api.isFeatureEnabled("flag")).toBeUndefined();
    expect(api.getSessionId()).toBe("");
    expect(api.getSentryIntegration()).toEqual({ type: "posthog-sentry" });
    expect(state.captureCalls).toEqual([]);
    expect(state.initCalls).toEqual([]);
    expect(state.sessionListeners).toEqual([]);
    expect(unsubscribe()).toBeUndefined();
  });
});

describe("runtime posthog api", () => {
  afterEach(() => {
    vi.unstubAllEnvs();
    vi.doUnmock("posthog-js");
  });

  it("lazy-loads and initializes the runtime client when enabled", async () => {
    vi.resetModules();
    vi.stubEnv("PROD", true);
    vi.stubEnv("PUBLIC_POSTHOG_KEY", "phc_runtime");
    vi.stubEnv("PUBLIC_POSTHOG_HOST", "https://posthog.example");

    const { fakePostHog, state } = createFakePostHog();
    vi.doMock("posthog-js", () => ({ default: fakePostHog }));

    const runtime = await import("@/lib/observability/posthog");

    runtime.initPostHog();
    await vi.waitFor(() => {
      expect(state.initCalls).toHaveLength(1);
    });
    runtime.capturePostHogEvent("runtime_event", { ok: true });
    await vi.waitFor(() => {
      expect(state.captureCalls).toHaveLength(1);
    });

    expect(runtime.isPostHogEnabled()).toBe(true);
    expect(state.initCalls).toHaveLength(1);
    expect(state.initCalls[0]?.token).toBe("phc_runtime");
    expect(state.captureCalls).toEqual([
      { eventName: "runtime_event", properties: { ok: true } },
    ]);
    expect(runtime.getPostHogSessionId()).toBe("session-123");
    await expect(runtime.getPostHogSentryIntegration()).resolves.toEqual({
      type: "posthog-sentry",
    });
  });

  it("returns noops when runtime PostHog is disabled", async () => {
    vi.resetModules();
    vi.stubEnv("PROD", false);
    vi.stubEnv("PUBLIC_POSTHOG_KEY", "");

    const runtime = await import("@/lib/observability/posthog");
    const unsubscribe = runtime.onPostHogSessionId(() => undefined);

    runtime.initPostHog();
    runtime.capturePostHogEvent("ignored");

    expect(runtime.isPostHogEnabled()).toBe(false);
    expect(runtime.getPostHogSessionId()).toBe("");
    expect(unsubscribe()).toBeUndefined();
    await expect(
      runtime.getPostHogSentryIntegration()
    ).resolves.toBeUndefined();
  });
});
