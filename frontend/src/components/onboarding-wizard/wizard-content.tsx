import { ChevronRight, Sparkles, Workflow } from "lucide-react";
import type { ReactNode } from "react";
import { AppInlineError } from "@/components/app-error-view";
import { Logo } from "@/components/logo";
import { EmbeddedPhase } from "@/components/onboarding-wizard/phases/embedded-phase";
import { ErrorSummaryPhase } from "@/components/onboarding-wizard/phases/error-summary-phase";
import { ManualYamlPhase } from "@/components/onboarding-wizard/phases/manual-yaml-phase";
import { MethodSelectionPhase } from "@/components/onboarding-wizard/phases/method-selection-phase";
import { ProgressPhase } from "@/components/onboarding-wizard/phases/progress-phase";
import { UiConfiguredPhase } from "@/components/onboarding-wizard/phases/ui-configured-phase";
import { getRailDoneCount } from "@/components/onboarding-wizard/shared/progress-rail-state";
import { WizardPage } from "@/components/onboarding-wizard/shared/wizard-page";
import type {
  ConfigMethod,
  WizardPhase,
} from "@/components/onboarding-wizard/types";
import { Button } from "@/components/querylane-ui/button";
import { Card, CardContent } from "@/components/querylane-ui/card";
import { Spinner } from "@/components/ui/spinner";
import { captureException } from "@/lib/diagnostics";
import type { AppUiError } from "@/lib/ui-error-types";
import { cn } from "@/lib/utils";
import { useOnboardingWizardStore } from "@/stores/onboarding-wizard-store";
import { useSetupStore } from "@/stores/setup-store";
import styles from "./wizard-content.module.css";

const PLACEHOLDER_CARD_IDS = ["queries", "history", "connections"] as const;
const PROGRESS_RAIL_CARDS = [
  {
    description: "Metadata ready",
    key: "schema",
    label: "Schema",
  },
  {
    description: "Metadata ready",
    key: "tables",
    label: "Tables",
  },
  {
    description: "Metadata ready",
    key: "indexes",
    label: "Indexes",
  },
  {
    description: "Configuration written",
    key: "config",
    label: "Config",
  },
] as const;
interface RailModel {
  caption: string;
  visual: ReactNode;
}
function getStepCounter(phase: WizardPhase) {
  if (phase === "method_selection") {
    return "1 / 3";
  }
  if (
    phase === "configure_ui" ||
    phase === "configure_yaml" ||
    phase === "configure_embedded"
  ) {
    return "2 / 3";
  }
  return "3 / 3";
}
function RailSurface({ children }: { children: ReactNode }) {
  return (
    <div
      aria-hidden="true"
      className="relative isolate flex min-h-[240px] w-full max-w-[300px] items-center justify-center overflow-hidden rounded-3xl border border-white/10 bg-white/3 px-5 py-6 shadow-(--shadow-onboarding-panel)"
      data-onboarding-rail-visual=""
    >
      <div className={cn("absolute inset-0", styles["railGlow"])} />
      {children}
    </div>
  );
}
function SelectionRail() {
  return (
    <RailSurface>
      <div className="relative flex w-full max-w-[320px] flex-col items-center gap-5">
        <div className="relative h-[220px] w-full">
          <div className="absolute top-0 left-6 h-20 w-[76%] rounded-card border border-white/14 bg-white/8 backdrop-blur-md" />
          <div className="absolute top-16 left-0 h-32 w-full rounded-3xl border border-white/14 bg-white/8 p-5 backdrop-blur-md">
            <div className="mb-4 h-3.5 w-28 rounded-full bg-onboarding-accent" />
            <div className="grid grid-cols-3 gap-4">
              {PLACEHOLDER_CARD_IDS.map((cardId) => (
                <div
                  className="h-20 rounded-2xl border border-white/8 bg-white/6"
                  key={cardId}
                />
              ))}
            </div>
          </div>
          <div className="absolute bottom-0 left-0 h-20 w-full rounded-card border border-white/14 bg-white/8 px-4 py-3 backdrop-blur-md">
            <div className="flex items-center gap-3.5">
              <div className="size-10 rounded-panel-sm bg-onboarding-primary-hover" />
              <div className="flex-1 space-y-2">
                <div className="h-3.5 w-2/3 rounded-full bg-white/18" />
                <div className="h-2.5 w-1/2 rounded-full bg-white/12" />
              </div>
            </div>
          </div>
        </div>
      </div>
    </RailSurface>
  );
}
function ConfigRail({ compact = false }: { compact?: boolean }) {
  return (
    <RailSurface>
      <div
        className={cn(
          "relative w-full max-w-[320px] space-y-5",
          compact && "max-w-[300px]"
        )}
        data-testid="onboarding-config-rail"
      >
        <div className="mx-auto w-[82%] rounded-dialog-sm border border-white/14 bg-white/8 px-5 py-4 backdrop-blur-md">
          <div className="mb-3 flex items-center gap-2.5 text-white/56">
            <Sparkles className="size-4 text-info-300" />
            <span className="font-mono text-xs">config.yaml</span>
          </div>
          <div className="space-y-2 font-mono text-xs leading-5">
            <div className="text-highlight-300">database:</div>
            <div className="text-info-300">
              {" "}
              host: <span className="text-white">localhost</span>
            </div>
            <div className="text-info-300">
              {" "}
              port: <span className="text-warning-200">5432</span>
            </div>
            <div className="text-info-300">
              {" "}
              database: <span className="text-warning-200">querylane</span>
            </div>
            <div className="text-info-300">
              {" "}
              ssl_mode: <span className="text-white">disable</span>
            </div>
          </div>
        </div>
        <div className="mx-auto w-[88%] rounded-dialog-sm border border-white/14 bg-white/8 p-4 backdrop-blur-md">
          <div className="flex items-center gap-3.5">
            <div className="flex size-9 items-center justify-center rounded-xl bg-positive-500/16 text-positive-200">
              <Workflow className="size-4.5" />
            </div>
            <div className="space-y-0.5">
              <div className="font-medium text-base text-white">
                Metadata setup
              </div>
              <div className="text-white/52 text-xs">
                Schema, migrations, configuration
              </div>
            </div>
          </div>
          <div className="mt-3 grid grid-cols-2 gap-2.5">
            <div className="rounded-xl border border-white/8 bg-white/5 p-3 text-center">
              <div className="font-semibold text-white text-xl">4</div>
              <div className="text-white/45 text-xs">steps</div>
            </div>
            <div className="rounded-xl border border-white/8 bg-white/5 p-3 text-center">
              <div className="font-semibold text-white text-xl">OK</div>
              <div className="text-white/45 text-xs">status</div>
            </div>
          </div>
        </div>
      </div>
    </RailSurface>
  );
}
function ProgressRail({ success = false }: { success?: boolean }) {
  const progressEvents = useOnboardingWizardStore(
    (state) => state.progressEvents
  );
  const doneCount = getRailDoneCount(
    progressEvents,
    PROGRESS_RAIL_CARDS.length,
    success
  );
  return (
    <RailSurface>
      <div className="w-full max-w-[320px] space-y-5">
        <div className="mx-auto flex h-24 w-[82%] items-center justify-center rounded-card border border-white/14 bg-white/8 backdrop-blur-md">
          <div
            className={cn(
              "flex size-14 items-center justify-center rounded-card-sm",
              success
                ? "bg-positive-500/18 text-positive-200"
                : "bg-onboarding-primary text-info-300"
            )}
          >
            {success ? (
              <Sparkles className="size-6" />
            ) : (
              <Spinner className="size-6" />
            )}
          </div>
        </div>
        <div className="space-y-3">
          {PROGRESS_RAIL_CARDS.map((card, index) => {
            const isDone = index < doneCount;
            return (
              <div
                className="flex items-center justify-between rounded-xl border border-white/10 bg-white/5 px-3.5 py-2.5"
                key={card.key}
              >
                <div className="space-y-0.5">
                  <div className="font-medium text-sm text-white">
                    {card.label}
                  </div>
                  <div className="text-white/45 text-xs">
                    {card.description}
                  </div>
                </div>
                <span
                  className={cn(
                    "rounded-full px-2.5 py-1 font-medium text-xs",
                    isDone
                      ? "bg-positive-500/15 text-positive-200"
                      : "bg-white/6 text-white/55"
                  )}
                >
                  {isDone ? "done" : "pending"}
                </span>
              </div>
            );
          })}
        </div>
      </div>
    </RailSurface>
  );
}
function getRailModel(
  phase: WizardPhase,
  selectedMethod: ConfigMethod | null
): RailModel {
  if (phase === "method_selection") {
    return {
      caption: "Your configuration hub for connections, queries, and history.",
      visual: <SelectionRail />,
    };
  }
  if (phase === "configure_ui") {
    return {
      caption: "We’ll handle the configuration for you.",
      visual: <ConfigRail />,
    };
  }
  if (phase === "configure_yaml") {
    return {
      caption: "Keep your configuration in versioned files and watched paths.",
      visual: <ConfigRail compact={true} />,
    };
  }
  if (phase === "configure_embedded") {
    return {
      caption: "Embedded PostgreSQL, managed by Querylane on this machine.",
      visual: <ConfigRail compact={true} />,
    };
  }
  if (phase === "progress_success") {
    return {
      caption: "Your Querylane instance is ready to explore.",
      visual: <ProgressRail success={true} />,
    };
  }
  if (phase === "progress_waiting_for_config") {
    return {
      caption: "Save your config file to continue setup.",
      visual: <ProgressRail />,
    };
  }
  return {
    caption:
      selectedMethod === "embedded"
        ? "Setting up embedded PostgreSQL and the Querylane metadata schema."
        : "Applying your database setup and finalizing configuration.",
    visual: <ProgressRail />,
  };
}
function LoadingContent({ onRefresh }: { onRefresh: () => Promise<void> }) {
  return (
    <WizardPage
      description="Fetching setup options from the server and checking which onboarding methods are available in this environment."
      footer={
        <div className="flex justify-end">
          <Button
            className="h-9"
            onClick={() => {
              onRefresh().catch((error) => captureException(error));
            }}
            presentation="onboarding-primary"
          >
            Refresh
            <ChevronRight className="size-4" />
          </Button>
        </div>
      }
      title="Loading onboarding state"
    >
      <div className="flex h-full items-center justify-center">
        <div className="flex items-center gap-3 rounded-2xl border border-white/10 bg-white/3 px-4 py-3 text-sm text-white/68">
          <Spinner className="size-4" />
          Checking Querylane setup prerequisites…
        </div>
      </div>
    </WizardPage>
  );
}
function renderWizardPhase(phase: WizardPhase) {
  switch (phase) {
    case "method_selection":
      return <MethodSelectionPhase />;
    case "configure_ui":
      return <UiConfiguredPhase />;
    case "configure_yaml":
      return <ManualYamlPhase />;
    case "configure_embedded":
      return <EmbeddedPhase />;
    case "progress_running":
    case "progress_waiting_for_config":
    case "progress_success":
      return <ProgressPhase />;
    case "error_summary":
      return <ErrorSummaryPhase />;
    default:
      return phase satisfies never;
  }
}

const CONFIGURE_PHASES = new Set<WizardPhase>([
  "configure_ui",
  "configure_yaml",
  "configure_embedded",
]);

function isConfigurePhase(phase: WizardPhase): boolean {
  return CONFIGURE_PHASES.has(phase);
}

function OnboardingStageContent({
  configureError,
  phase,
  showWizardErrorBanner,
  wizardStateError,
}: {
  configureError: AppUiError | null;
  phase: WizardPhase;
  showWizardErrorBanner: boolean;
  wizardStateError: string | undefined;
}) {
  const showPreviousErrorBanner =
    showWizardErrorBanner &&
    Boolean(wizardStateError) &&
    phase === "method_selection";
  const showConfigureError = Boolean(configureError) && isConfigurePhase(phase);
  return (
    <>
      {showPreviousErrorBanner ? (
        <div className="rounded-2xl border border-warning-400/18 bg-warning-500/8 px-4 py-3">
          <div className="font-medium text-base text-warning-50">
            Previous setup attempt failed
          </div>
          <p className="mt-1.5 text-sm text-warning-50/78 leading-6">
            {wizardStateError}
          </p>
        </div>
      ) : null}

      {showConfigureError && configureError ? (
        <AppInlineError error={configureError} />
      ) : null}

      {renderWizardPhase(phase)}
    </>
  );
}
export function OnboardingWizardContent() {
  const onboardingState = useSetupStore((state) => state.onboardingState);
  const refreshOnboardingState = useSetupStore(
    (state) => state.refreshOnboardingState
  );
  const showWizardErrorBanner = useSetupStore(
    (state) => state.showWizardErrorBanner
  );
  const configureError = useOnboardingWizardStore(
    (state) => state.configureError
  );
  const phase = useOnboardingWizardStore((state) => state.phase);
  const selectedMethod = useOnboardingWizardStore(
    (state) => state.selectedMethod
  );
  const wizardStateError = onboardingState?.appDatabaseStatus?.error;
  const railModel = getRailModel(phase, selectedMethod);
  const mainContent = onboardingState ? (
    <OnboardingStageContent
      configureError={configureError}
      phase={phase}
      showWizardErrorBanner={showWizardErrorBanner}
      wizardStateError={wizardStateError}
    />
  ) : (
    <LoadingContent onRefresh={refreshOnboardingState} />
  );
  return (
    <div className="dark w-full">
      <div
        className="relative min-h-dvh overflow-hidden bg-onboarding-backdrop px-4 py-6 sm:px-6 sm:py-8"
        data-onboarding-shell=""
      >
        <div
          className={cn(
            "pointer-events-none absolute inset-0",
            styles["backdrop"]
          )}
        />
        <div
          className={cn(
            "pointer-events-none absolute inset-0 opacity-20 [background-size:40px_40px]",
            styles["dotPattern"]
          )}
        />
        <div className="relative mx-auto flex min-h-[calc(100dvh-3rem)] w-full max-w-4xl items-center justify-center xl:max-w-5xl">
          <Card
            className="relative w-full overflow-hidden"
            data-onboarding-panel=""
            data-testid="onboarding-panel"
            presentation="onboarding"
          >
            <CardContent presentation="flush">
              <div className="grid grid-cols-1 lg:min-h-[460px] lg:grid-cols-[minmax(0,1.2fr)_minmax(250px,0.8fr)]">
                <section className="flex flex-col bg-onboarding-card px-5 py-5 sm:px-6 sm:py-6 lg:px-7 lg:py-7">
                  <div className="mx-auto flex h-full w-full max-w-4xl flex-1 flex-col">
                    <div className="mb-5 flex items-center justify-between gap-4 text-white/62">
                      <Logo className="text-white" size={22} />
                      <div className="rounded-full border border-white/10 bg-white/3 px-3 py-1 font-medium text-white/62 text-xs tracking-display">
                        {getStepCounter(phase)}
                      </div>
                    </div>
                    <div className="flex flex-1 flex-col gap-4">
                      {mainContent}
                    </div>
                  </div>
                </section>
                <aside
                  className="relative hidden border-white/10 bg-onboarding-grid lg:block lg:border-l"
                  data-onboarding-rail=""
                >
                  <div
                    className={cn(
                      "pointer-events-none absolute inset-0 opacity-35 [background-size:64px_64px]",
                      styles["linePattern"]
                    )}
                  />
                  <div className="relative flex h-full flex-col items-center justify-center gap-5 px-5 py-6">
                    {railModel.visual}
                    <p className="max-w-[300px] text-center text-white/58 text-xs leading-5 xl:text-sm xl:leading-6">
                      {railModel.caption}
                    </p>
                  </div>
                </aside>
              </div>
            </CardContent>
          </Card>
        </div>
      </div>
    </div>
  );
}
