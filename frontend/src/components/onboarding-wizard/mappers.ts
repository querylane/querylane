import type {
  ConfigMethod,
  WizardPhase,
} from "@/components/onboarding-wizard/types";

export function getMethodLabel(method: ConfigMethod): string {
  if (method === "ui_configured") {
    return "Configure via UI";
  }

  if (method === "manual_yaml") {
    return "Configure YAML manually";
  }

  return "Use embedded database";
}

export function shouldAutoRunSetup(
  phase: WizardPhase,
  selectedMethod: ConfigMethod | null
): selectedMethod is "embedded" | "ui_configured" {
  return (
    phase === "progress_running" &&
    selectedMethod !== null &&
    selectedMethod !== "manual_yaml"
  );
}
