import { env } from "@/env";
import type { AppUiError } from "@/lib/ui-error-types";

const BUG_REPORT_TEMPLATE = "bug_report.yml";
const DEFAULT_GITHUB_REPOSITORY = "querylane/querylane";
const GITHUB_REPOSITORY_PATTERN =
  /^[0-9A-Za-z][0-9A-Za-z_.-]*\/[0-9A-Za-z][0-9A-Za-z_.-]*$/u;
const MAX_COMPONENT_STACK_LENGTH = 600;
const MAX_STACK_LENGTH = 2000;
const POSTGRES_URL_PROTOCOLS = new Set(["postgres:", "postgresql:"]);
const STACK_FRAME_PATTERN = /^\s*at\s/u;
const STACK_URL_PATTERN = /[a-z][a-z0-9+.-]*:\/\/[^\s)]+/giu;

function redactStackUrl(value: string): string {
  try {
    const url = new URL(value);
    if (POSTGRES_URL_PROTOCOLS.has(url.protocol)) {
      return "[redacted connection string]";
    }
    url.username = "";
    url.password = "";
    url.search = "";
    url.hash = "";
    return url.toString();
  } catch {
    return "[redacted URL]";
  }
}

function sanitizeStack(
  stack: string | null | undefined,
  maxLength: number
): string | null {
  if (!stack) {
    return null;
  }

  const frames = stack
    .split("\n")
    .filter((line) => STACK_FRAME_PATTERN.test(line))
    .join("\n")
    .replace(STACK_URL_PATTERN, redactStackUrl);

  return frames.length > 0 ? frames.slice(0, maxLength) : null;
}

function resolveGitHubRepository(repository: string | undefined): string {
  const candidate = repository?.trim() ?? "";
  return GITHUB_REPOSITORY_PATTERN.test(candidate)
    ? candidate
    : DEFAULT_GITHUB_REPOSITORY;
}

function buildSupportDiagnostics(error: AppUiError) {
  const componentStack = sanitizeStack(
    error.context.componentStack,
    MAX_COMPONENT_STACK_LENGTH
  );
  const stack = sanitizeStack(error.stack, MAX_STACK_LENGTH);

  return {
    code: error.codeLabel,
    context: {
      action: error.context.action,
      area: error.context.area,
      endpoint: error.context.endpoint,
      routeId: error.context.routeId,
      source: error.source,
      surface: error.context.surface,
      stepDisplayName: error.context.stepDisplayName,
      stepId: error.context.stepId,
    },
    postgres: error.postgres
      ? {
          conditionName: error.postgres.conditionName,
          kind: error.postgres.kind,
          operation: error.postgres.operation,
          retryGuidance: error.postgres.retryGuidance,
          sqlstate: error.postgres.sqlstate,
          sqlstateClass: error.postgres.sqlstateClass,
        }
      : null,
    reason: error.connectReason,
    stack,
    componentStack,
    title: error.title,
    unexpectedResponse: error.unexpectedResponse
      ? {
          contentType: error.unexpectedResponse.contentType,
          kind: error.unexpectedResponse.kind,
          status: error.unexpectedResponse.status,
        }
      : null,
  };
}

function buildGitHubBugReportUrl(
  error: AppUiError,
  repository = env.PUBLIC_GITHUB_REPO
): string {
  const resolvedRepository = resolveGitHubRepository(repository);
  const url = new URL(`https://github.com/${resolvedRepository}/issues/new`);
  url.searchParams.set("template", BUG_REPORT_TEMPLATE);
  url.searchParams.set("title", error.title);
  url.searchParams.set(
    "diagnostics",
    JSON.stringify(buildSupportDiagnostics(error), null, 2)
  );
  return url.toString();
}

export { buildGitHubBugReportUrl };
