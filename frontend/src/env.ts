import { createEnv } from "@t3-oss/env-core";
import { z } from "zod/v4";

export const env = createEnv({
  client: {
    PUBLIC_API_BASE_URL: z
      .union([z.url(), z.literal("")])
      .optional()
      .transform((value) => value ?? ""),
    PUBLIC_GITHUB_REPO: z.string().optional(),
    PUBLIC_POSTHOG_HOST: z.string().optional(),
    PUBLIC_POSTHOG_KEY: z.string().optional(),
    PUBLIC_SENTRY_DSN: z.string().optional(),
    PUBLIC_SENTRY_ENABLE_CONSOLE_LOG_INTEGRATION: z.string().optional(),
    PUBLIC_SENTRY_ENABLE_LOGS: z.string().optional(),
    PUBLIC_SENTRY_ENVIRONMENT: z.string().optional(),
    PUBLIC_SENTRY_RELEASE: z.string().optional(),
    PUBLIC_SENTRY_REPLAYS_ON_ERROR_SAMPLE_RATE: z.string().optional(),
    PUBLIC_SENTRY_REPLAYS_SESSION_SAMPLE_RATE: z.string().optional(),
    PUBLIC_SENTRY_TRACES_SAMPLE_RATE: z.string().optional(),
  },
  clientPrefix: "PUBLIC_",
  runtimeEnv: {
    PUBLIC_API_BASE_URL: import.meta.env.PUBLIC_API_BASE_URL,
    PUBLIC_GITHUB_REPO: import.meta.env.PUBLIC_GITHUB_REPO,
    PUBLIC_POSTHOG_HOST: import.meta.env.PUBLIC_POSTHOG_HOST,
    PUBLIC_POSTHOG_KEY: import.meta.env.PUBLIC_POSTHOG_KEY,
    PUBLIC_SENTRY_DSN: import.meta.env.PUBLIC_SENTRY_DSN,
    PUBLIC_SENTRY_ENABLE_CONSOLE_LOG_INTEGRATION: import.meta.env
      .PUBLIC_SENTRY_ENABLE_CONSOLE_LOG_INTEGRATION,
    PUBLIC_SENTRY_ENABLE_LOGS: import.meta.env.PUBLIC_SENTRY_ENABLE_LOGS,
    PUBLIC_SENTRY_ENVIRONMENT: import.meta.env.PUBLIC_SENTRY_ENVIRONMENT,
    PUBLIC_SENTRY_RELEASE: import.meta.env.PUBLIC_SENTRY_RELEASE,
    PUBLIC_SENTRY_REPLAYS_ON_ERROR_SAMPLE_RATE: import.meta.env
      .PUBLIC_SENTRY_REPLAYS_ON_ERROR_SAMPLE_RATE,
    PUBLIC_SENTRY_REPLAYS_SESSION_SAMPLE_RATE: import.meta.env
      .PUBLIC_SENTRY_REPLAYS_SESSION_SAMPLE_RATE,
    PUBLIC_SENTRY_TRACES_SAMPLE_RATE: import.meta.env
      .PUBLIC_SENTRY_TRACES_SAMPLE_RATE,
  },
});
