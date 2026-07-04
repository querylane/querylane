import { describe, expect, it } from "vitest";

import {
  createReactRootErrorHandlers,
  reportReactRootError,
} from "@/lib/react-root-errors";
import type { AppUiError, AppUiErrorContext } from "@/lib/ui-error-types";

function createDependencies() {
  const normalizedErrors: AppUiError[] = [];
  const reportCalls: Array<{
    error: AppUiError;
    tags?: Record<string, string> | undefined;
  }> = [];

  const dependencies = {
    normalizeAppUiError: (error: unknown, context?: AppUiErrorContext) => {
      const normalizedError = {
        context: context ?? {},
        originalError: error,
      } as AppUiError;
      normalizedErrors.push(normalizedError);
      return normalizedError;
    },
    reportAppUiError: (
      error: AppUiError,
      options?: { tags?: Record<string, string> | undefined }
    ) => {
      reportCalls.push({ error, tags: options?.tags });
    },
  };

  return { dependencies, normalizedErrors, reportCalls };
}

describe("react root error handlers", () => {
  it("reports uncaught React root errors with runtime context", () => {
    const { dependencies, normalizedErrors, reportCalls } =
      createDependencies();
    const error = new Error("render failed");

    reportReactRootError(
      "uncaught-error",
      error,
      { componentStack: "\n    at App" },
      dependencies
    );

    expect(normalizedErrors).toHaveLength(1);
    expect(normalizedErrors[0]?.originalError).toBe(error);
    expect(normalizedErrors[0]?.context).toEqual({
      action: "uncaught-error",
      area: "react-root",
      componentStack: "at App",
      source: "runtime",
      surface: "silent",
    });
    expect(reportCalls).toEqual([
      {
        error: normalizedErrors[0]!,
        tags: {
          react_error_lifecycle: "uncaught-error",
          react_has_component_stack: "true",
        },
      },
    ]);
  });

  it("wires React 19 createRoot caught and recoverable callbacks", () => {
    const { dependencies, normalizedErrors, reportCalls } =
      createDependencies();
    const handlers = createReactRootErrorHandlers(dependencies);

    handlers.onCaughtError?.("caught", { componentStack: "" });
    handlers.onRecoverableError?.("recoverable", {});
    handlers.onUncaughtError?.("uncaught", {});

    expect(normalizedErrors.map((error) => error.originalError)).toEqual([
      "caught",
      "recoverable",
      "uncaught",
    ]);
    expect(normalizedErrors.map((error) => error.context.action)).toEqual([
      "caught-error",
      "recoverable-error",
      "uncaught-error",
    ]);
    expect(reportCalls.map((call) => call.tags)).toEqual([
      {
        react_error_lifecycle: "caught-error",
        react_has_component_stack: "false",
      },
      {
        react_error_lifecycle: "recoverable-error",
        react_has_component_stack: "false",
      },
      {
        react_error_lifecycle: "uncaught-error",
        react_has_component_stack: "false",
      },
    ]);
  });
});
