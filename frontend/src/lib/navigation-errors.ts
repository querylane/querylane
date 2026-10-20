import { logger } from "@/lib/diagnostics";
import { errorMessageOf } from "@/lib/error-message";

interface NavigationErrorContext {
  area: string;
}

type NavigationResult = Promise<unknown> | undefined;

function isNavigationCancellationError(error: unknown) {
  if (
    typeof DOMException !== "undefined" &&
    error instanceof DOMException &&
    error.name === "AbortError"
  ) {
    return true;
  }

  if (!(error instanceof Error)) {
    return false;
  }

  const normalizedErrorText = `${error.name} ${error.message}`.toLowerCase();
  return ["abort", "cancel", "supersed"].some((term) =>
    normalizedErrorText.includes(term)
  );
}

const DEFAULT_CONTEXT: NavigationErrorContext = { area: "navigation" };

function handleNavigationError(
  error: unknown,
  context: NavigationErrorContext = DEFAULT_CONTEXT
) {
  const payload = {
    area: context.area,
    errorMessage: errorMessageOf(error),
  };
  if (isNavigationCancellationError(error)) {
    logger.debug("Navigation promise rejected", payload);
    return;
  }

  logger.warn("Navigation promise rejected", payload);
}

function handleNavigationResult(
  result: NavigationResult,
  context: NavigationErrorContext = DEFAULT_CONTEXT
) {
  Promise.resolve(result).catch((error: unknown) => {
    handleNavigationError(error, context);
  });
}

export {
  handleNavigationError,
  handleNavigationResult,
  isNavigationCancellationError,
};
