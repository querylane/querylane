export type WizardPhase =
  | "method_selection"
  | "configure_ui"
  | "configure_yaml"
  | "configure_embedded"
  | "progress_running"
  | "progress_waiting_for_config"
  | "progress_success"
  | "error_summary";

export type ConfigMethod = "embedded" | "manual_yaml" | "ui_configured";

export interface OnboardingWizardProps {
  onFinish?: (() => void) | undefined;
  open?: boolean | undefined;
}
