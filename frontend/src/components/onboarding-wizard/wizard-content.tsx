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
import { WizardPage } from "@/components/onboarding-wizard/shared/wizard-page";
import type {
  ConfigMethod,
  WizardPhase,
} from "@/components/onboarding-wizard/types";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Spinner } from "@/components/ui/spinner";
import { captureException } from "@/lib/diagnostics";
import { anyPredicate } from "@/lib/predicates";
import type { AppUiError } from "@/lib/ui-error-types";
import { cn } from "@/lib/utils";
import { useOnboardingWizardStore } from "@/stores/onboarding-wizard-store";
import { useSetupStore } from "@/stores/setup-store";

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
function ShellConfetti() {
  return (
    <>
      <span className="pointer-events-none absolute bottom-20 left-[52%] h-3 w-10 rotate-[-24deg] rounded-full bg-[#2f67ff]/60 blur-[1px]" />
      <span className="pointer-events-none absolute bottom-10 left-[58%] size-4 rounded-full bg-[#3f5ac5]/70" />
      <span className="pointer-events-none absolute right-12 bottom-16 h-3 w-12 rotate-[22deg] rounded-full bg-emerald-400/70 blur-[1px]" />
      <span className="pointer-events-none absolute right-16 bottom-28 size-5 rounded-full bg-[#8052ff]/65" />
    </>
  );
}
function RailSurface({ children }: { children: ReactNode }) {
  return (
    <div
      aria-hidden="true"
      className="relative isolate flex min-h-[280px] w-full max-w-[360px] items-center justify-center overflow-hidden rounded-[28px] border border-white/10 bg-white/[0.03] px-6 py-8 shadow-[0_20px_80px_rgba(2,4,10,0.32)]"
      data-onboarding-rail-visual=""
    >
      <div className="absolute inset-0 bg-[radial-gradient(circle_at_40%_30%,rgba(64,102,255,0.18),transparent_40%),radial-gradient(circle_at_60%_72%,rgba(129,71,255,0.12),transparent_34%)]" />
      {children}
    </div>
  );
}
function SelectionRail() {
  return (
    <RailSurface>
      <div className="relative flex w-full max-w-[320px] flex-col items-center gap-5">
        <div className="relative h-[220px] w-full">
          <div className="absolute top-0 left-6 h-20 w-[76%] rounded-[20px] border border-white/14 bg-white/[0.08] backdrop-blur-md" />
          <div className="absolute top-16 left-0 h-32 w-full rounded-[24px] border border-white/14 bg-white/[0.08] p-5 backdrop-blur-md">
            <div className="mb-4 h-3.5 w-28 rounded-full bg-[#4d72d8]" />
            <div className="grid grid-cols-3 gap-4">
              {PLACEHOLDER_CARD_IDS.map((cardId) => (
                <div
                  className="h-20 rounded-[16px] border border-white/8 bg-white/[0.06]"
                  key={cardId}
                />
              ))}
            </div>
          </div>
          <div className="absolute bottom-0 left-0 h-20 w-full rounded-[20px] border border-white/14 bg-white/[0.08] px-4 py-3 backdrop-blur-md">
            <div className="flex items-center gap-3.5">
              <div className="size-10 rounded-[12px] bg-[#1d3d8e]" />
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
        <div className="mx-auto w-[82%] rounded-[22px] border border-white/14 bg-white/[0.08] px-5 py-4 backdrop-blur-md">
          <div className="mb-3 flex items-center gap-2.5 text-white/56">
            <Sparkles className="size-[18px] text-blue-300" />
            <span className="font-mono text-sm">config.yaml</span>
          </div>
          <div className="space-y-2.5 font-mono text-sm leading-6">
            <div className="text-fuchsia-300">database:</div>
            <div className="text-blue-300">
              {" "}
              host: <span className="text-white">localhost</span>
            </div>
            <div className="text-blue-300">
              {" "}
              port: <span className="text-amber-200">5432</span>
            </div>
            <div className="text-blue-300">
              {" "}
              database: <span className="text-amber-200">querylane</span>
            </div>
            <div className="text-blue-300">
              {" "}
              ssl_mode: <span className="text-white">disable</span>
            </div>
          </div>
        </div>
        <div className="mx-auto w-[88%] rounded-[22px] border border-white/14 bg-white/[0.08] p-4 backdrop-blur-md">
          <div className="flex items-center gap-3.5">
            <div className="flex size-11 items-center justify-center rounded-[14px] bg-emerald-500/16 text-emerald-200">
              <Workflow className="size-[22px]" />
            </div>
            <div className="space-y-1">
              <div className="font-medium text-lg text-white">
                Metadata setup
              </div>
              <div className="text-sm text-white/52">
                Schema, migrations, configuration
              </div>
            </div>
          </div>
          <div className="mt-4 grid grid-cols-2 gap-3">
            <div className="rounded-[16px] border border-white/8 bg-white/[0.05] px-3 py-4 text-center">
              <div className="font-semibold text-2xl text-white">4</div>
              <div className="text-white/45 text-xs">steps</div>
            </div>
            <div className="rounded-[16px] border border-white/8 bg-white/[0.05] px-3 py-4 text-center">
              <div className="font-semibold text-2xl text-white">OK</div>
              <div className="text-white/45 text-xs">status</div>
            </div>
          </div>
        </div>
      </div>
    </RailSurface>
  );
}
function ProgressRail({ success = false }: { success?: boolean }) {
  return (
    <RailSurface>
      <div className="w-full max-w-[320px] space-y-5">
        <div className="mx-auto flex h-32 w-[82%] items-center justify-center rounded-[24px] border border-white/14 bg-white/[0.08] backdrop-blur-md">
          <div
            className={cn(
              "flex size-20 items-center justify-center rounded-[24px]",
              success
                ? "bg-emerald-500/18 text-emerald-200"
                : "bg-[#21479e] text-blue-300"
            )}
          >
            {success ? (
              <Sparkles className="size-8" />
            ) : (
              <Spinner className="size-8" />
            )}
          </div>
        </div>
        <div className="space-y-3">
          {PROGRESS_RAIL_CARDS.map((card, index) => (
            <div
              className="flex items-center justify-between rounded-[16px] border border-white/10 bg-white/[0.05] px-4 py-3.5"
              key={card.key}
            >
              <div className="space-y-0.5">
                <div className="font-medium text-base text-white">
                  {card.label}
                </div>
                <div className="text-white/45 text-xs">{card.description}</div>
              </div>
              <span
                className={cn(
                  "rounded-full px-2.5 py-1 font-medium text-xs",
                  success || index < 2
                    ? "bg-emerald-500/15 text-emerald-200"
                    : "bg-white/[0.06] text-white/55"
                )}
              >
                {success || index < 2 ? "done" : "pending"}
              </span>
            </div>
          ))}
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
            className="h-10 rounded-xl bg-white px-4 font-medium text-[#11151f] text-sm hover:bg-white/90"
            onClick={() => {
              onRefresh().catch((error) => captureException(error));
            }}
          >
            Refresh
            <ChevronRight className="size-4" />
          </Button>
        </div>
      }
      title="Loading onboarding state"
    >
      <div className="flex h-full items-center justify-center">
        <div className="flex items-center gap-3 rounded-2xl border border-white/10 bg-white/[0.03] px-4 py-3 text-sm text-white/68">
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
  const showConfigureError =
    Boolean(configureError) &&
    anyPredicate(
      () => phase === "configure_ui",
      () => phase === "configure_yaml",
      () => phase === "configure_embedded"
    );
  return (
    <>
      {showPreviousErrorBanner ? (
        <div className="rounded-2xl border border-amber-400/18 bg-amber-500/[0.08] px-4 py-3">
          <div className="font-medium text-amber-50 text-base">
            Previous setup attempt failed
          </div>
          <p className="mt-1.5 text-amber-50/78 text-sm leading-6">
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
        className="relative min-h-screen overflow-hidden bg-[#03050a] px-4 py-6 sm:px-6 sm:py-8"
        data-onboarding-shell=""
      >
        <div className="pointer-events-none absolute inset-0 bg-[radial-gradient(circle_at_top,rgba(69,98,196,0.12),transparent_32%),radial-gradient(circle_at_50%_45%,rgba(63,93,194,0.12),transparent_28%)]" />
        <div className="pointer-events-none absolute inset-0 bg-[radial-gradient(rgba(255,255,255,0.08)_1px,transparent_1px)] opacity-20 [background-size:40px_40px]" />
        <div className="relative mx-auto flex min-h-[calc(100vh-3rem)] w-full max-w-6xl items-center justify-center xl:max-w-7xl">
          <Card
            className="relative w-full overflow-hidden border-white/10 bg-[#05070c] text-white shadow-[0_32px_96px_rgba(0,0,0,0.45)]"
            data-onboarding-panel=""
            data-testid="onboarding-panel"
          >
            {phase === "progress_success" ? <ShellConfetti /> : null}
            <CardContent className="p-0">
              <div className="grid min-h-[720px] grid-cols-1 lg:grid-cols-[minmax(0,1.06fr)_minmax(320px,0.94fr)]">
                <section className="flex flex-col bg-[#05070c] px-5 py-6 sm:px-6 sm:py-8 lg:px-8 lg:py-8 xl:px-10 xl:py-10">
                  <div className="mx-auto flex h-full w-full max-w-4xl flex-1 flex-col">
                    <div className="mb-6 flex items-center justify-between gap-4 text-white/62 sm:mb-8">
                      <Logo className="text-white" size={28} />
                      <div className="rounded-full border border-white/10 bg-white/[0.03] px-3 py-1 font-medium text-sm text-white/62 tracking-[0.18em]">
                        {getStepCounter(phase)}
                      </div>
                    </div>
                    <div className="flex flex-1 flex-col gap-4">
                      {mainContent}
                    </div>
                  </div>
                </section>
                <aside
                  className="relative hidden border-white/10 bg-[#090b10] lg:block lg:border-l"
                  data-onboarding-rail=""
                >
                  <div className="pointer-events-none absolute inset-0 bg-[linear-gradient(to_right,rgba(255,255,255,0.08)_1px,transparent_1px),linear-gradient(to_bottom,rgba(255,255,255,0.08)_1px,transparent_1px)] opacity-35 [background-size:64px_64px]" />
                  <div className="relative flex h-full flex-col items-center justify-center gap-8 px-6 py-8 xl:px-8 xl:py-10">
                    {railModel.visual}
                    <p className="max-w-[320px] text-center text-base text-white/58 leading-7 xl:text-lg xl:leading-8">
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
