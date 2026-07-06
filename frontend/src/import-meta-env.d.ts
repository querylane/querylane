declare global {
  interface RsbuildTypeOptions {
    strictImportMetaEnv: true;
  }

  interface ImportMetaEnv {
    readonly PUBLIC_API_BASE_URL?: string;
    readonly PUBLIC_GITHUB_REPO?: string;
    readonly PUBLIC_POSTHOG_HOST?: string;
    readonly PUBLIC_POSTHOG_KEY?: string;
    readonly PUBLIC_SENTRY_DSN?: string;
    readonly PUBLIC_SENTRY_ENABLE_CONSOLE_LOG_INTEGRATION?: string;
    readonly PUBLIC_SENTRY_ENABLE_LOGS?: string;
    readonly PUBLIC_SENTRY_ENVIRONMENT?: string;
    readonly PUBLIC_SENTRY_RELEASE?: string;
    readonly PUBLIC_SENTRY_REPLAYS_ON_ERROR_SAMPLE_RATE?: string;
    readonly PUBLIC_SENTRY_REPLAYS_SESSION_SAMPLE_RATE?: string;
    readonly PUBLIC_SENTRY_TRACES_SAMPLE_RATE?: string;
    readonly PUBLIC_TEST_BROWSER_THEME?: string;
  }
}

export {};
