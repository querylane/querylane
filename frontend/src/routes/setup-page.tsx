import { useNavigate, useSearch } from "@tanstack/react-router";
import { useEffect } from "react";
import { AppInlineError } from "@/components/app-error-view";
import { BrandedLoadingState } from "@/components/branded-loading-state";
import { OnboardingWizard } from "@/components/onboarding-wizard/wizard";
import { useConsoleConfigStatus } from "@/hooks/api/console";
import { useDb } from "@/lib/db-context";
import { errorMessageOf } from "@/lib/error-message";
import { handleNavigationError } from "@/lib/navigation-errors";
import { logger } from "@/lib/observability/sentry";
import { useBlockingErrorStore } from "@/stores/blocking-error-store";
import { useSetupStore } from "@/stores/setup-store";

export function SetupRoutePage() {
  const navigate = useNavigate({ from: "/setup" });
  const search = useSearch({ from: "/setup" });
  const blockingError = useBlockingErrorStore((state) => state.blockingError);
  const clearBlockingError = useBlockingErrorStore(
    (state) => state.clearBlockingError
  );
  const status = useSetupStore((state) => state.status);
  const verifyAfterSetup = useSetupStore((state) => state.verifyAfterSetup);
  const { instances, queryStates } = useDb();
  const instancesState = queryStates.instances;
  const { isConfigManaged, isLoaded: isModeLoaded } = useConsoleConfigStatus();

  useEffect(
    function handleSetupNavigation() {
      if (
        status !== "ready" ||
        !(instancesState.hasResolved || instancesState.error) ||
        !isModeLoaded
      ) {
        return;
      }
      clearBlockingError();
      if (!instancesState.error && instances.length === 0 && !isConfigManaged) {
        navigate({ replace: true, to: "/new-instance" }).catch(
          (error: unknown) =>
            handleNavigationError(error, { area: "setup.new-instance" })
        );
        return;
      }
      navigate({ href: search.returnTo ?? "/", replace: true }).catch(
        (error: unknown) =>
          handleNavigationError(error, { area: "setup.return" })
      );
    },
    [
      clearBlockingError,
      instances.length,
      instancesState.error,
      instancesState.hasResolved,
      isConfigManaged,
      isModeLoaded,
      navigate,
      search.returnTo,
      status,
    ]
  );

  if (
    status === "ready" &&
    !instancesState.hasResolved &&
    !instancesState.error
  ) {
    return (
      <BrandedLoadingState
        description="Looking up available instances."
        title="Loading Querylane"
        variant="fullscreen"
      />
    );
  }

  return (
    <div className="min-h-screen bg-background">
      <div className="flex w-full flex-col">
        {blockingError?.blockingReason === "setup_required" ? (
          <AppInlineError error={blockingError} />
        ) : null}
        <OnboardingWizard
          onFinish={() => {
            verifyAfterSetup().catch((error: unknown) => {
              logger.warn("Setup verification failed", {
                area: "setup.verify-after-finish",
                errorMessage: errorMessageOf(error),
              });
            });
          }}
          open={true}
        />
      </div>
    </div>
  );
}
