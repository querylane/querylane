import { TooltipProvider } from "@/components/ui/tooltip";
import { ThemeProvider } from "@/theme-provider";
import {
  isVisualScenarioName,
  VISUAL_SCENARIOS,
} from "@/visual-harness/scenarios";

function VisualHarness({ scenario }: { scenario: string }) {
  if (!isVisualScenarioName(scenario)) {
    return (
      <main className="text-foreground p-6">
        <h1 className="text-lg font-semibold">Unknown visual scenario</h1>
        <p>Open one of: {Object.keys(VISUAL_SCENARIOS).sort().join(", ")}.</p>
      </main>
    );
  }

  const Scenario = VISUAL_SCENARIOS[scenario];

  // The theme follows prefers-color-scheme, which each Playwright project sets.
  return (
    <ThemeProvider storageKey="querylane-visual-harness-theme">
      <TooltipProvider>
        <main
          aria-label="Visual scenario"
          className="bg-background text-foreground inline-block p-6"
          data-testid="visual-frame"
        >
          <Scenario />
        </main>
      </TooltipProvider>
    </ThemeProvider>
  );
}

export { VisualHarness };
