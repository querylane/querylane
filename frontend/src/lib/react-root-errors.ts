import type { RootOptions } from "react-dom/client";

import { normalizeAppUiError, reportAppUiError } from "@/lib/ui-error";

type ReactRootErrorLifecycle =
  | "caught-error"
  | "recoverable-error"
  | "uncaught-error";

type ReactRootErrorInfo = Parameters<
  NonNullable<RootOptions["onCaughtError"]>
>[1];

interface ReactRootErrorReporterDependencies {
  normalizeAppUiError: typeof normalizeAppUiError;
  reportAppUiError: typeof reportAppUiError;
}

const defaultReactRootErrorReporterDependencies: ReactRootErrorReporterDependencies =
  {
    normalizeAppUiError,
    reportAppUiError,
  };

function getComponentStack(errorInfo: {
  componentStack?: string | undefined;
}): string | null {
  const componentStack = errorInfo.componentStack?.trim();
  return componentStack && componentStack.length > 0 ? componentStack : null;
}

function reportReactRootError({
  lifecycle,
  error,
  errorInfo,
  dependencies = defaultReactRootErrorReporterDependencies,
}: {
  lifecycle: ReactRootErrorLifecycle;
  error: unknown;
  errorInfo: { componentStack?: string | undefined };
  dependencies?: ReactRootErrorReporterDependencies;
}) {
  const componentStack = getComponentStack(errorInfo);
  const appError = dependencies.normalizeAppUiError(error, {
    action: lifecycle,
    area: "react-root",
    componentStack,
    source: "runtime",
    surface: "silent",
  });

  dependencies.reportAppUiError(appError, {
    tags: {
      react_error_lifecycle: lifecycle,
      react_has_component_stack: componentStack ? "true" : "false",
    },
  });
}

function createReactRootErrorHandlers(
  dependencies?: ReactRootErrorReporterDependencies
): Pick<
  RootOptions,
  "onCaughtError" | "onRecoverableError" | "onUncaughtError"
> {
  const dependencyOptions = dependencies === undefined ? {} : { dependencies };
  return {
    onCaughtError(error: unknown, errorInfo: ReactRootErrorInfo) {
      reportReactRootError({
        lifecycle: "caught-error",
        error,
        errorInfo,
        ...dependencyOptions,
      });
    },
    onRecoverableError(error: unknown, errorInfo) {
      reportReactRootError({
        lifecycle: "recoverable-error",
        error,
        errorInfo,
        ...dependencyOptions,
      });
    },
    onUncaughtError(error: unknown, errorInfo) {
      reportReactRootError({
        lifecycle: "uncaught-error",
        error,
        errorInfo,
        ...dependencyOptions,
      });
    },
  };
}

export { createReactRootErrorHandlers, reportReactRootError };
