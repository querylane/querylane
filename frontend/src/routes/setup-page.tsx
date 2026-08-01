import { useNavigate, useSearch } from "@tanstack/react-router";
import { useEffect } from "react";
import { AppInlineError } from "@/components/app-error-view";
import { BrandedLoadingState } from "@/components/branded-loading-state";
import { OnboardingWizard } from "@/components/onboarding-wizard/wizard";
import { useConsoleConfigStatus } from "@/hooks/api/console";
import { useDb } from "@/lib/db-context";
import { logger } from "@/lib/diagnostics";
import { errorMessageOf } from "@/lib/error-message";
import { handleNavigationError } from "@/lib/navigation-errors";
import { useBlockingErrorStore } from "@/stores/blocking-error-store";
import { useOnboardingWizardStore } from "@/stores/onboarding-wizard-store";
import { useSetupStore } from "@/stores/setup-store";

export function SetupRoutePage() {
  const navigate = useNavigate({ from: "/setup" });
  const search = useSearch({ from: "/setup" });
  const wizardPhase = useOnboardingWizardStore((state) => state.phase);
  const wizardMethod = useOnboardingWizardStore(
    (state) => state.selectedMethod
  );

  useEffect(
    function syncWizardMethodToUrl() {
      // Mirror the wizard's progress into ?method=… so any step past method
      // selection is a shareable, refresh-safe deep link. Only clear the param
      // once a method was actually selected (going Back), so an inbound deep
      // link is never stripped before the wizard has had a chance to apply it.
      const urlMethod =
        wizardPhase === "method_selection"
          ? undefined
          : (wizardMethod ?? undefined);
      if (wizardMethod === null || search.method === urlMethod) {
        return;
      }
      navigate({
        replace: true,
        search: (previous) => ({ ...previous, method: urlMethod }),
      }).catch((error: unknown) =>
        handleNavigationError(error, { area: "setup.method-sync" })
      );
    },
    [navigate, search.method, wizardMethod, wizardPhase]
  );
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
    <div className="min-h-dvh bg-background">
      <div className="flex w-full flex-col">
        {blockingError && blockingError.blockingReason !== "setup_required" ? (
          <AppInlineError error={blockingError} />
        ) : null}
        <OnboardingWizard
          initialMethod={search.method}
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
