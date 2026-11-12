import { ThemeProvider } from "@/theme-provider";
import {
  isVisualScenarioName,
  VISUAL_SCENARIOS,
} from "@/visual-harness/scenarios";

function VisualHarness({ scenario }: { scenario: string }) {
  if (!isVisualScenarioName(scenario)) {
    return (
      <main className="p-6 text-foreground">
        <h1 className="text-lg font-semibold">Unknown visual scenario</h1>
        <p>
          Open one of: {Object.keys(VISUAL_SCENARIOS).toSorted().join(", ")}.
        </p>
      </main>
    );
  }

  const Scenario = VISUAL_SCENARIOS[scenario];

  // The theme follows prefers-color-scheme, which each Playwright project sets.
  return (
    <ThemeProvider storageKey="querylane-visual-harness-theme">
      <main
        aria-label="Visual scenario"
        className="inline-block bg-background p-6 text-foreground"
        data-testid="visual-frame"
      >
        <Scenario />
      </main>
    </ThemeProvider>
  );
}

export { VisualHarness };
