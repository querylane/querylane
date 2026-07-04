import type { ReactNode } from "react";
import { vi } from "vitest";
import { OnboardingWizardControllerProvider } from "@/components/onboarding-wizard/controller-provider";
import type { OnboardingWizardController } from "@/components/onboarding-wizard/hooks/use-onboarding-wizard-controller";
import { TooltipProvider } from "@/components/ui/tooltip";
import { ThemeProvider } from "@/theme-provider";

function getBrowserVisualTheme() {
  if (
    typeof document !== "undefined" &&
    document.documentElement.dataset["visualTheme"] === "light"
  ) {
    return "light";
  }
  return "dark";
}

function ScreenshotFrame({ children }: { children: ReactNode }) {
  const visualTheme = getBrowserVisualTheme();
  const themeClassName = visualTheme === "dark" ? "dark" : "light";
  return (
    <ThemeProvider
      defaultTheme={visualTheme}
      storageKey="querylane-browser-test-theme"
    >
      <TooltipProvider>
        <div
          className={`${themeClassName} bg-background p-6 text-foreground`}
          data-testid="screenshot-frame"
          data-visual-test-root=""
        >
          {children}
        </div>
      </TooltipProvider>
    </ThemeProvider>
  );
}

function createMockOnboardingController(
  overrides: Partial<OnboardingWizardController> = {}
): OnboardingWizardController {
  return {
    finishWizard: vi.fn(),
    goBackToConfigure: vi.fn(),
    goBackToMethodSelection: vi.fn(),
    refreshOnboardingState: vi.fn(async () => undefined),
    retryWatch: vi.fn(async () => undefined),
    setupRunning: false,
    watchIsRunning: false,
    watchManualRetryRequired: false,
    watchRetryPending: false,
    ...overrides,
  };
}

function OnboardingBrowserHarness({
  children,
  controller = createMockOnboardingController(),
}: {
  children: ReactNode;
  controller?: OnboardingWizardController;
}) {
  return (
    <ScreenshotFrame>
      <OnboardingWizardControllerProvider controller={controller}>
        {children}
      </OnboardingWizardControllerProvider>
    </ScreenshotFrame>
  );
}

export { OnboardingBrowserHarness, ScreenshotFrame };
