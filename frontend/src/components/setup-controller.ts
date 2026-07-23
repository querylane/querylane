import { useEffect, useEffectEvent, useRef, useState } from "react";
import type {
  SetupContextValue,
  SetupStatus,
} from "@/components/setup-context";
import { useGetOnboardingStateQuery } from "@/hooks/api/onboarding";
import { captureException, logger } from "@/lib/diagnostics";
import { QUERY_STALE_TIME } from "@/lib/query-policy";
import { normalizeAppUiError } from "@/lib/ui-error";
import type { AppUiError } from "@/lib/ui-error-types";
import { AppDatabaseStatus_State } from "@/protogen/querylane/console/v1alpha1/console_pb";
import type { GetOnboardingStateResponse } from "@/protogen/querylane/console/v1alpha1/onboarding_pb";
import { registerSetupRequiredHandler } from "@/stores/setup-required-signal";
import { resolveRoutingDecision } from "@/stores/setup-routing";

interface RefreshContext {
  action: string;
  source: "boot" | "setup";
  verification: boolean;
}

type RoutingDecision = ReturnType<typeof resolveRoutingDecision>;

function getRoutingDecision(
  onboardingState: GetOnboardingStateResponse | null
): RoutingDecision | null {
  if (!onboardingState) {
    return null;
  }
  return resolveRoutingDecision(
    onboardingState.isConfigured,
    onboardingState.appDatabaseStatus?.state ??
      AppDatabaseStatus_State.UNSPECIFIED
  );
}

function getBootError(
  operationError: AppUiError | null,
  queryError: Error | null
) {
  if (operationError) {
    return operationError;
  }
  if (!queryError) {
    return null;
  }
  return normalizeAppUiError(queryError, {
    action: "bootstrap",
    area: "setup",
    source: "boot",
  });
}

function getSetupStatus({
  bootError,
  isPending,
  routeTarget,
  setupRequired,
  verifying,
}: {
  bootError: AppUiError | null;
  isPending: boolean;
  routeTarget: "onboarding" | "ready" | null;
  setupRequired: boolean;
  verifying: boolean;
}): SetupStatus {
  if (bootError) {
    return "boot_error";
  }
  if (verifying) {
    return "verifying";
  }
  if (setupRequired) {
    return "onboarding";
  }
  if (isPending) {
    return "booting";
  }
  return routeTarget ?? "booting";
}

function useSetupController(): SetupContextValue {
  const onboardingQuery = useGetOnboardingStateQuery({
    refetchOnReconnect: true,
    staleTime: QUERY_STALE_TIME.immediate,
  });
  const [setupRequired, setSetupRequired] = useState(false);
  const [operationError, setOperationError] = useState<AppUiError | null>(null);
  const [verifying, setVerifying] = useState(false);
  const requestSequence = useRef(0);
  const onboardingState = onboardingQuery.data ?? null;
  const routingDecision = getRoutingDecision(onboardingState);
  const warningCode = routingDecision?.warningCode ?? null;
  const bootError = getBootError(operationError, onboardingQuery.error);

  const runRefresh = async (context: RefreshContext) => {
    requestSequence.current += 1;
    const requestId = requestSequence.current;
    setOperationError(null);
    setVerifying(context.verification);

    try {
      await onboardingQuery.refetch({ throwOnError: true });
      if (requestId === requestSequence.current) {
        setSetupRequired(false);
      }
    } catch (error) {
      if (requestId === requestSequence.current) {
        setOperationError(
          normalizeAppUiError(error, {
            action: context.action,
            area: "setup",
            source: context.source,
          })
        );
      }
      throw error;
    } finally {
      if (requestId === requestSequence.current) {
        setVerifying(false);
      }
    }
  };

  const refreshOnboardingState = () =>
    runRefresh({
      action: "refreshOnboardingState",
      source: "boot",
      verification: false,
    });

  const verifyAfterSetup = () =>
    runRefresh({
      action: "verifyAfterSetup",
      source: "setup",
      verification: true,
    });

  const onSetupRequired = useEffectEvent(function handleSetupRequiredSignal() {
    setSetupRequired(true);
    refreshOnboardingState().catch((error) => captureException(error));
  });

  useEffect(function subscribeToSetupRequiredSignal() {
    return registerSetupRequiredHandler(() => onSetupRequired());
  }, []);

  useEffect(
    function reportRoutingWarning() {
      if (!warningCode) {
        return;
      }
      logger.warn("Inconsistent onboarding routing state", {
        area: "setup",
        warningCode,
      });
    },
    [warningCode]
  );

  return {
    bootError,
    onboardingState,
    refreshOnboardingState,
    showDegradedBanner: routingDecision?.showDegradedBanner ?? false,
    showWizardErrorBanner: routingDecision?.showWizardErrorBanner ?? false,
    status: getSetupStatus({
      bootError,
      isPending: onboardingQuery.isPending,
      routeTarget: routingDecision?.routeTarget ?? null,
      setupRequired,
      verifying,
    }),
    verifyAfterSetup,
    warningCode,
  };
}

export { useSetupController };
