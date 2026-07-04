import type {
  FeatureFlagOptions,
  FeatureFlagResult,
  JsonType,
  PostHogConfig,
  Properties,
} from "posthog-js";

import { env as typedEnv } from "@/env";

const DEFAULT_POSTHOG_HOST = "https://us.i.posthog.com";

function getRuntimeEnv(): Record<string, string | undefined> {
  return typedEnv;
}

interface PostHogRuntimeConfig {
  apiHost: string;
  apiKey: string;
  enabled: boolean;
}

interface ResolvePostHogRuntimeConfigOptions {
  env: Record<string, string | undefined>;
  isProd: boolean;
}

type PostHogSessionIdListener = (
  sessionId: string,
  windowId: string | null | undefined
) => void;

interface PostHogClientLike {
  capture: (
    eventName: string,
    properties?: Properties | null
  ) => unknown | undefined;
  get_session_id: () => string;
  getFeatureFlag: (
    key: string,
    options?: FeatureFlagOptions
  ) => boolean | string | undefined;
  getFeatureFlagResult: (
    key: string,
    options?: FeatureFlagOptions
  ) => FeatureFlagResult | undefined;
  init: (
    token: string,
    config?: Partial<PostHogConfig>,
    name?: string
  ) => unknown;
  isFeatureEnabled: (
    key: string,
    options?: FeatureFlagOptions
  ) => boolean | undefined;
  onSessionId: (callback: PostHogSessionIdListener) => () => void;
  sentryIntegration: () => unknown;
}

function resolvePostHogRuntimeConfig({
  env,
  isProd,
}: ResolvePostHogRuntimeConfigOptions): PostHogRuntimeConfig {
  const apiKey = env["PUBLIC_POSTHOG_KEY"]?.trim() ?? "";
  const apiHost = env["PUBLIC_POSTHOG_HOST"]?.trim() || DEFAULT_POSTHOG_HOST;

  return {
    apiHost,
    apiKey,
    enabled: isProd && apiKey.length > 0,
  };
}

function createNoopUnsubscribe() {
  return () => undefined;
}

function createPostHogInitConfig(
  config: PostHogRuntimeConfig
): Partial<PostHogConfig> {
  return {
    api_host: config.apiHost,
    autocapture: {
      dom_event_allowlist: ["click"],
      element_allowlist: [
        "a",
        "button",
        "form",
        "input",
        "label",
        "select",
        "textarea",
      ],
    },
    capture_pageleave: false,
    capture_pageview: false,
    defaults: "2026-05-30",
    disable_session_recording: true,
    mask_all_element_attributes: true,
    mask_all_text: true,
    mask_personal_data_properties: true,
  };
}

function createPostHogApi(
  client: PostHogClientLike,
  config: PostHogRuntimeConfig
) {
  let initialized = false;

  return {
    capture(eventName: string, properties?: Properties) {
      if (!config.enabled) {
        return;
      }

      client.capture(eventName, properties ?? null);
    },
    config,
    getFeatureFlag(flagKey: string, options?: FeatureFlagOptions) {
      if (!config.enabled) {
        return;
      }

      return client.getFeatureFlag(flagKey, options);
    },
    getFeatureFlagPayload(flagKey: string, options?: FeatureFlagOptions) {
      if (!config.enabled) {
        return;
      }

      const result = client.getFeatureFlagResult(flagKey, options);
      return result?.payload as JsonType | undefined;
    },
    getFeatureFlagResult(flagKey: string, options?: FeatureFlagOptions) {
      if (!config.enabled) {
        return;
      }

      return client.getFeatureFlagResult(flagKey, options);
    },
    getSentryIntegration() {
      return client.sentryIntegration();
    },
    getSessionId() {
      if (!config.enabled) {
        return "";
      }

      return client.get_session_id();
    },
    init() {
      if (initialized || !config.enabled) {
        return;
      }

      client.init(config.apiKey, createPostHogInitConfig(config));
      initialized = true;
    },
    isEnabled() {
      return config.enabled;
    },
    isFeatureEnabled(flagKey: string, options?: FeatureFlagOptions) {
      if (!config.enabled) {
        return;
      }

      return client.isFeatureEnabled(flagKey, options);
    },
    onSessionId(callback: PostHogSessionIdListener) {
      if (!config.enabled) {
        return createNoopUnsubscribe();
      }

      return client.onSessionId(callback);
    },
  };
}

const runtimeConfig = resolvePostHogRuntimeConfig({
  env: getRuntimeEnv(),
  isProd: import.meta.env.PROD,
});

let postHogClientPromise: Promise<PostHogClientLike> | undefined;
let loadedPostHogClient: PostHogClientLike | undefined;
let runtimePostHogInitialized = false;

function loadPostHogClient(): Promise<PostHogClientLike> {
  postHogClientPromise ??= import("posthog-js").then((posthogModule) => {
    const client: PostHogClientLike = posthogModule.default;
    loadedPostHogClient = client;
    return client;
  });

  return postHogClientPromise;
}

function reportLazyLoadFailure(_error: unknown) {
  return;
}

async function getInitializedPostHogClient() {
  if (!runtimeConfig.enabled) {
    return;
  }

  const client = await loadPostHogClient();
  if (!runtimePostHogInitialized) {
    client.init(runtimeConfig.apiKey, createPostHogInitConfig(runtimeConfig));
    runtimePostHogInitialized = true;
  }
  return client;
}

const runtimePostHog = {
  capture(eventName: string, properties?: Properties) {
    if (!runtimeConfig.enabled) {
      return;
    }

    getInitializedPostHogClient()
      .then((client) => client?.capture(eventName, properties ?? null))
      .catch(reportLazyLoadFailure);
  },
  async getSentryIntegration() {
    if (!runtimeConfig.enabled) {
      return;
    }

    const client = await getInitializedPostHogClient();
    return client?.sentryIntegration();
  },
  getSessionId() {
    if (!(runtimeConfig.enabled && loadedPostHogClient)) {
      return "";
    }

    return loadedPostHogClient.get_session_id();
  },
  init() {
    if (!runtimeConfig.enabled) {
      return;
    }

    getInitializedPostHogClient().catch(reportLazyLoadFailure);
  },
  isEnabled() {
    return runtimeConfig.enabled;
  },
  onSessionId(callback: PostHogSessionIdListener) {
    if (!runtimeConfig.enabled) {
      return createNoopUnsubscribe();
    }

    getInitializedPostHogClient()
      .then((client) => client?.onSessionId(callback))
      .catch(reportLazyLoadFailure);
    return createNoopUnsubscribe();
  },
};

const initPostHog = runtimePostHog.init;
const isPostHogEnabled = runtimePostHog.isEnabled;
const capturePostHogEvent = runtimePostHog.capture;
const getPostHogSentryIntegration = runtimePostHog.getSentryIntegration;
const getPostHogSessionId = runtimePostHog.getSessionId;
const onPostHogSessionId = runtimePostHog.onSessionId;

export type { PostHogRuntimeConfig };
export {
  capturePostHogEvent,
  createPostHogApi,
  getPostHogSentryIntegration,
  getPostHogSessionId,
  initPostHog,
  isPostHogEnabled,
  onPostHogSessionId,
  resolvePostHogRuntimeConfig,
};
