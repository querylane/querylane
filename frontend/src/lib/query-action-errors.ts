import { errorMessageOf } from "@/lib/error-message";
import { logger } from "@/lib/observability/sentry";

interface QueryActionErrorContext {
  action: "load-more" | "retry";
  area: string;
}

function handleQueryActionError(
  error: unknown,
  context: QueryActionErrorContext
) {
  logger.warn("Query action failed", {
    action: context.action,
    area: context.area,
    errorMessage: errorMessageOf(error),
  });
}

export { handleQueryActionError };
