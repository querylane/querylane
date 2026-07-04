import { AppDatabaseStatus_State } from "@/protogen/querylane/console/v1alpha1/console_pb";

type RouteTarget = "onboarding" | "ready";

type RoutingWarningCode =
  | "INCONSISTENT_READY_WHILE_NOT_CONFIGURED"
  | "INCONSISTENT_NOT_CONFIGURED_WHILE_CONFIGURED";

interface RoutingDecision {
  routeTarget: RouteTarget;
  showDegradedBanner: boolean;
  showWizardErrorBanner: boolean;
  warningCode: RoutingWarningCode | null;
}

function resolveRoutingDecision(
  isConfigured: boolean,
  dbState: AppDatabaseStatus_State
): RoutingDecision {
  if (!isConfigured) {
    if (dbState === AppDatabaseStatus_State.ERROR) {
      return {
        routeTarget: "onboarding",
        showDegradedBanner: false,
        showWizardErrorBanner: true,
        warningCode: null,
      };
    }

    if (dbState === AppDatabaseStatus_State.READY) {
      return {
        routeTarget: "onboarding",
        showDegradedBanner: false,
        showWizardErrorBanner: false,
        warningCode: "INCONSISTENT_READY_WHILE_NOT_CONFIGURED",
      };
    }

    return {
      routeTarget: "onboarding",
      showDegradedBanner: false,
      showWizardErrorBanner: false,
      warningCode: null,
    };
  }

  if (dbState === AppDatabaseStatus_State.ERROR) {
    return {
      routeTarget: "ready",
      showDegradedBanner: true,
      showWizardErrorBanner: false,
      warningCode: null,
    };
  }

  if (dbState === AppDatabaseStatus_State.NOT_CONFIGURED) {
    return {
      routeTarget: "ready",
      showDegradedBanner: false,
      showWizardErrorBanner: false,
      warningCode: "INCONSISTENT_NOT_CONFIGURED_WHILE_CONFIGURED",
    };
  }

  return {
    routeTarget: "ready",
    showDegradedBanner: false,
    showWizardErrorBanner: false,
    warningCode: null,
  };
}

export type { RoutingWarningCode };
export { resolveRoutingDecision };
