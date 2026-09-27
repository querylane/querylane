import type { ComponentType } from "react";
import {
  ConsoleEmptyStatesScenario,
  ConsolePageErrorScenario,
  ConsoleResourceOverviewScenario,
  ConsoleSqlstateScenario,
} from "@/visual-harness/console-scenarios";

// Keys are the `scenario` query parameter that Playwright visual specs open.
const VISUAL_SCENARIOS = {
  "console-empty-states": ConsoleEmptyStatesScenario,
  "console-page-error": ConsolePageErrorScenario,
  "console-resource-overview": ConsoleResourceOverviewScenario,
  "console-sqlstate": ConsoleSqlstateScenario,
} satisfies Record<string, ComponentType>;

type VisualScenarioName = keyof typeof VISUAL_SCENARIOS;

function isVisualScenarioName(value: string): value is VisualScenarioName {
  return Object.hasOwn(VISUAL_SCENARIOS, value);
}

export type { VisualScenarioName };
export { isVisualScenarioName, VISUAL_SCENARIOS };
