import { logger } from "@/lib/diagnostics";
import { errorMessageOf } from "@/lib/error-message";

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
