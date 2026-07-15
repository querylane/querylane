import { describe, expect, it } from "vitest";

import { AppDatabaseStatus_State } from "@/protogen/querylane/console/v1alpha1/console_pb";
import { resolveRoutingDecision } from "@/stores/setup-routing";

describe("setup-routing decision table", () => {
  it("routes to onboarding when not configured and state is not configured", () => {
    const decision = resolveRoutingDecision(
      false,
      AppDatabaseStatus_State.NOT_CONFIGURED
    );

    expect(decision.routeTarget).toBe("onboarding");
    expect(decision.showWizardErrorBanner).toBe(false);
    expect(decision.showDegradedBanner).toBe(false);
    expect(decision.warningCode).toBeNull();
  });

  it("routes to onboarding with wizard banner when not configured and state is error", () => {
    const decision = resolveRoutingDecision(
      false,
      AppDatabaseStatus_State.ERROR
    );

    expect(decision.routeTarget).toBe("onboarding");
    expect(decision.showWizardErrorBanner).toBe(true);
    expect(decision.showDegradedBanner).toBe(false);
    expect(decision.warningCode).toBeNull();
  });

  it("routes to onboarding defensively when not configured but state is ready", () => {
    const decision = resolveRoutingDecision(
      false,
      AppDatabaseStatus_State.READY
    );

    expect(decision.routeTarget).toBe("onboarding");
    expect(decision.warningCode).toBe(
      "INCONSISTENT_READY_WHILE_NOT_CONFIGURED"
    );
  });

  it("routes to ready when configured and state is ready", () => {
    const decision = resolveRoutingDecision(
      true,
      AppDatabaseStatus_State.READY
    );

    expect(decision.routeTarget).toBe("ready");
    expect(decision.showWizardErrorBanner).toBe(false);
    expect(decision.showDegradedBanner).toBe(false);
    expect(decision.warningCode).toBeNull();
  });

  it("routes to ready with degraded banner when configured and state is error", () => {
    const decision = resolveRoutingDecision(
      true,
      AppDatabaseStatus_State.ERROR
    );

    expect(decision.routeTarget).toBe("ready");
    expect(decision.showDegradedBanner).toBe(true);
    expect(decision.showWizardErrorBanner).toBe(false);
    expect(decision.warningCode).toBeNull();
  });

  it("routes to ready defensively when configured but state is not configured", () => {
    const decision = resolveRoutingDecision(
      true,
      AppDatabaseStatus_State.NOT_CONFIGURED
    );

    expect(decision.routeTarget).toBe("ready");
    expect(decision.warningCode).toBe(
      "INCONSISTENT_NOT_CONFIGURED_WHILE_CONFIGURED"
    );
  });
});
