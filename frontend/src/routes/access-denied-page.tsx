import { useNavigate, useSearch } from "@tanstack/react-router";
import { ShieldX } from "lucide-react";
import { AppErrorView } from "@/components/app-error-view";
import { AppShellFrame } from "@/components/app-shell-frame";
import { Button } from "@/components/ui/button";
import { handleNavigationError } from "@/lib/navigation-errors";
import { normalizeAppUiError } from "@/lib/ui-error";
import type { AppUiError } from "@/lib/ui-error-types";
import { waitForNextFrame } from "@/lib/wait-for-next-frame";
import { useBlockingErrorStore } from "@/stores/blocking-error-store";

function buildAccessDeniedError(error: AppUiError): AppUiError {
  if (error.blockingReason === "unauthenticated") {
    return {
      ...error,
      message:
        "Your session is not authorized for this screen right now. Retry after restoring access.",
      title: "Authentication required",
    };
  }
  if (error.blockingReason === "permission_denied") {
    return {
      ...error,
      message:
        "Your account does not have permission to continue here. Retry after your access is updated.",
      title: "Access denied",
    };
  }
  return {
    ...error,
    message:
      "Querylane blocked navigation because access could not be verified for this page.",
    title: "Access denied",
  };
}
export function AccessDeniedRoutePage() {
  const navigate = useNavigate({ from: "/access-denied" });
  const search = useSearch({ from: "/access-denied" });
  const blockingError = useBlockingErrorStore((state) => state.blockingError);
  const clearBlockingError = useBlockingErrorStore(
    (state) => state.clearBlockingError
  );
  const fallbackError = normalizeAppUiError(
    new Error("You cannot access this page."),
    {
      area: "access-denied",
      source: "connect",
    }
  );
  const error = buildAccessDeniedError(blockingError ?? fallbackError);
  return (
    <AppShellFrame>
      <div className="mx-auto flex max-w-5xl items-center justify-center">
        <div className="w-full space-y-4">
          <div className="flex items-center justify-center gap-2 text-muted-foreground">
            <ShieldX className="size-5" />
            <span className="font-medium text-sm">
              Blocking navigation until access is restored
            </span>
          </div>

          <AppErrorView
            actions={
              <Button
                onClick={() => {
                  clearBlockingError();
                  navigate({
                    replace: true,
                    to: "/",
                  }).catch((navigationError: unknown) =>
                    handleNavigationError(navigationError, {
                      area: "access-denied.home",
                    })
                  );
                }}
                size="sm"
                variant="secondary"
              >
                Go home
              </Button>
            }
            error={error}
            onRetry={() =>
              waitForNextFrame()
                .then(() => {
                  clearBlockingError();
                  return navigate({
                    href: search.returnTo ?? "/",
                    replace: true,
                  });
                })
                .catch((navigationError: unknown) =>
                  handleNavigationError(navigationError, {
                    area: "access-denied.retry",
                  })
                )
            }
            retryLabel="Retry"
            variant="page"
          />
        </div>
      </div>
    </AppShellFrame>
  );
}
