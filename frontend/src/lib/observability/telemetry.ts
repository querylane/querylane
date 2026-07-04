import {
  getPostHogSentryIntegration,
  getPostHogSessionId,
  initPostHog,
  isPostHogEnabled,
  onPostHogSessionId,
} from "@/lib/observability/posthog";
import {
  initSentry,
  sentryConfig,
  setSentryTag,
} from "@/lib/observability/sentry";

interface TelemetryDependencies {
  addSentryIntegration: (integration: unknown) => void;
  getPostHogSentryIntegration: () => Promise<unknown | undefined>;
  getPostHogSessionId: () => string;
  initPostHog: () => void;
  initSentry: () => void;
  isPostHogEnabled: () => boolean;
  isSentryEnabled: () => boolean;
  onPostHogSessionId: (
    callback: (sessionId: string, windowId: string | null | undefined) => void
  ) => () => void;
  setSentryTag: (key: string, value: string) => void;
}

type SentryIntegration = Parameters<
  typeof import("@sentry/react")["addIntegration"]
>[0];

function isSentryIntegration(value: unknown): value is SentryIntegration {
  return (
    typeof value === "object" &&
    value !== null &&
    "name" in value &&
    typeof value.name === "string"
  );
}

const defaultTelemetryDependencies: TelemetryDependencies = {
  addSentryIntegration: (integration: unknown) => {
    if (!isSentryIntegration(integration)) {
      return;
    }

    import("@sentry/react").then((sentry) => {
      sentry.addIntegration(integration);
    });
  },
  getPostHogSentryIntegration,
  getPostHogSessionId,
  initPostHog,
  initSentry,
  isPostHogEnabled,
  isSentryEnabled: () => sentryConfig.enabled,
  onPostHogSessionId,
  setSentryTag,
};

function updateSentryPostHogSessionTag(
  dependencies: TelemetryDependencies,
  sessionId: string
) {
  const normalizedSessionId = sessionId.trim();
  if (normalizedSessionId.length === 0) {
    return;
  }

  dependencies.setSentryTag("posthog_session_id", normalizedSessionId);
}

function createTelemetryApi(
  dependencies: TelemetryDependencies = defaultTelemetryDependencies
) {
  let initialized = false;

  return {
    init() {
      if (initialized) {
        return;
      }

      dependencies.initSentry();
      dependencies.initPostHog();

      if (dependencies.isSentryEnabled() && dependencies.isPostHogEnabled()) {
        const integrationRegistration = dependencies
          .getPostHogSentryIntegration()
          .then((postHogSentryIntegration) => {
            if (postHogSentryIntegration) {
              dependencies.addSentryIntegration(postHogSentryIntegration);
            }
          })
          .catch(() => undefined);

        updateSentryPostHogSessionTag(
          dependencies,
          dependencies.getPostHogSessionId()
        );

        dependencies.onPostHogSessionId((sessionId) => {
          updateSentryPostHogSessionTag(dependencies, sessionId);
        });

        initialized = true;
        return integrationRegistration;
      }

      initialized = true;
      return;
    },
  };
}

const runtimeTelemetry = createTelemetryApi();

const initTelemetry = runtimeTelemetry.init;

export { createTelemetryApi, initTelemetry, isSentryIntegration };
