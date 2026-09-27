import type { ComponentType } from "react";
import { MetricChartKitScenario } from "@/visual-harness/chart-scenarios";
import {
  ConsoleEmptyStatesScenario,
  ConsolePageErrorScenario,
  ConsoleResourceOverviewScenario,
  ConsoleSqlstateScenario,
} from "@/visual-harness/console-scenarios";
import {
  FeedbackFormRecoveryScenario,
  FeedbackSectionStatesScenario,
  PostgresErrorDetailsScenario,
  PostgresErrorSummariesScenario,
} from "@/visual-harness/feedback-scenarios";
import {
  OnboardingInvalidFieldsScenario,
  OnboardingProgressFailedScenario,
  OnboardingProgressRunningScenario,
  OnboardingProgressSuccessScenario,
  OnboardingStorageFullScenario,
  OnboardingYamlWaitingScenario,
} from "@/visual-harness/onboarding-scenarios";
import { DatabaseStructureMapScenario } from "@/visual-harness/structure-map-scenarios";

// Keys are the `scenario` query parameter that Playwright visual specs open.
const VISUAL_SCENARIOS = {
  "console-empty-states": ConsoleEmptyStatesScenario,
  "console-page-error": ConsolePageErrorScenario,
  "console-resource-overview": ConsoleResourceOverviewScenario,
  "console-sqlstate": ConsoleSqlstateScenario,
  "database-structure-map": DatabaseStructureMapScenario,
  "feedback-form-recovery": FeedbackFormRecoveryScenario,
  "feedback-postgres-error-details": PostgresErrorDetailsScenario,
  "feedback-postgres-error-summaries": PostgresErrorSummariesScenario,
  "feedback-section-states": FeedbackSectionStatesScenario,
  "metric-chart-kit": MetricChartKitScenario,
  "onboarding-invalid-fields": OnboardingInvalidFieldsScenario,
  "onboarding-progress-failed": OnboardingProgressFailedScenario,
  "onboarding-progress-running": OnboardingProgressRunningScenario,
  "onboarding-progress-success": OnboardingProgressSuccessScenario,
  "onboarding-storage-full": OnboardingStorageFullScenario,
  "onboarding-yaml-waiting": OnboardingYamlWaitingScenario,
} satisfies Record<string, ComponentType>;

type VisualScenarioName = keyof typeof VISUAL_SCENARIOS;

function isVisualScenarioName(value: string): value is VisualScenarioName {
  return Object.hasOwn(VISUAL_SCENARIOS, value);
}

export type { VisualScenarioName };
export { isVisualScenarioName, VISUAL_SCENARIOS };
