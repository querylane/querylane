import { toast } from "sonner";
import { captureException } from "@/lib/diagnostics";
import { normalizeAppUiError } from "@/lib/ui-error";

function reportActionError(error: unknown) {
  const uiError = normalizeAppUiError(error, {
    area: "ui-action",
    surface: "toast",
  });
  toast.error(uiError.title, { description: uiError.summary });
  captureException(error);
}

/** Adapt async UI callbacks without discarding failures or exposing raw errors. */
function handleAsyncAction<Args extends unknown[]>(
  action: (...args: Args) => Promise<unknown> | undefined
): (...args: Args) => undefined {
  return (...args) => {
    try {
      const result = action(...args);
      if (result !== undefined) {
        result.catch(reportActionError);
      }
    } catch (error) {
      reportActionError(error);
    }
    return undefined;
  };
}

export { handleAsyncAction };
