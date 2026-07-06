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

function handleNavigationError(
  error: unknown,
  context: NavigationErrorContext = { area: "navigation" }
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
  context: NavigationErrorContext = { area: "navigation" }
) {
  Promise.resolve(result).catch((error: unknown) =>
    handleNavigationError(error, context)
  );
}

export {
  handleNavigationError,
  handleNavigationResult,
  isNavigationCancellationError,
};
