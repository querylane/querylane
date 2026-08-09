import { ArrowLeft, Check, ClipboardCopy, FileCog } from "lucide-react";
import { useState } from "react";
import { useOnboardingWizardControllerContext } from "@/components/onboarding-wizard/hooks/use-onboarding-wizard-controller-context";
import { ProgressStepList } from "@/components/onboarding-wizard/shared/progress-step-list";
import { getProgressSummary } from "@/components/onboarding-wizard/shared/progress-step-summary";
import { WizardPage } from "@/components/onboarding-wizard/shared/wizard-page";
import { Button } from "@/components/ui/button";
import { Spinner } from "@/components/ui/spinner";
import { captureException } from "@/lib/diagnostics";
import { useOnboardingWizardStore } from "@/stores/onboarding-wizard-store";
import { useSetupStore } from "@/stores/setup-store";

const COPY_RESET_MS = 1500;
function WaitingForConfigBody({
  configFilePath,
  onRetryWatch,
  retryPending,
  watchNotice,
}: {
  configFilePath: string;
  onRetryWatch: () => Promise<void>;
  retryPending: boolean;
  watchNotice: string | null;
}) {
  const [pathCopied, setPathCopied] = useState(false);
  const copyPath = async () => {
    try {
      await navigator.clipboard.writeText(configFilePath);
      setPathCopied(true);
      window.setTimeout(() => setPathCopied(false), COPY_RESET_MS);
    } catch {
      /* noop */
    }
  };
  return (
    <div className="space-y-5">
      <div className="flex flex-col items-center gap-4 text-center">
        <div className="relative flex size-24 items-center justify-center rounded-full border border-white/8 bg-[radial-gradient(circle,rgba(98,122,255,0.14),rgba(7,9,15,0)_65%)]">
          <div className="absolute inset-3 rounded-full border border-white/7" />
          <div className="relative z-10 flex size-10 items-center justify-center rounded-xl border border-white/10 bg-white/[0.06] text-white/78">
            <FileCog className="size-5" />
          </div>
        </div>
        <Button
          className="flex h-auto max-w-full items-center gap-3 whitespace-normal rounded-xl border border-white/10 bg-white/[0.04] px-4 py-3 font-mono font-normal text-white/88 text-xs transition-colors hover:bg-white/[0.07]"
          onClick={copyPath}
          title="Click to copy path"
          type="button"
          variant="ghost"
        >
          <span className="min-w-0 break-all text-left">{configFilePath}</span>
          {pathCopied ? (
            <Check className="size-4 shrink-0 text-emerald-400" />
          ) : (
            <ClipboardCopy className="size-4 shrink-0 text-white/50" />
          )}
        </Button>
        {/* No explanatory copy here: the page description above this body
            already says Querylane is watching the path shown. */}
        <Button
          className="h-9 rounded-lg border border-white/10 bg-white/[0.04] px-4 font-medium text-sm text-white hover:bg-white/[0.07]"
          disabled={retryPending}
          onClick={() => {
            onRetryWatch().catch((error) => captureException(error));
          }}
          variant="ghost"
        >
          {retryPending ? (
            <Spinner className="size-5" />
          ) : (
            <FileCog className="size-5" />
          )}
          {retryPending ? "Checking for config…" : "I've saved the file"}
        </Button>
      </div>
      {watchNotice ? (
        <div className="rounded-xl border border-amber-400/25 bg-amber-500/[0.08] px-4 py-3 text-amber-50/90 text-sm">
          {watchNotice}
        </div>
      ) : null}
    </div>
  );
}
function SuccessCallout() {
  return (
    <div className="rounded-xl border border-emerald-400/32 bg-emerald-500/[0.1] p-4">
      <div className="flex items-start gap-4">
        <span className="mt-0.5 flex size-10 shrink-0 items-center justify-center rounded-full border border-emerald-400/35 bg-emerald-500/16 text-emerald-100">
          <Check aria-hidden="true" className="size-5" />
        </span>
        <div className="min-w-0 space-y-1.5">
          <div className="font-medium text-base text-emerald-100">
            Ready to go!
          </div>
          <p className="max-w-4xl text-emerald-50/90 text-sm leading-6">
            Querylane is now configured and ready to manage your PostgreSQL
            instances. Click finish to start exploring.
          </p>
        </div>
      </div>
    </div>
  );
}
export function ProgressPhase() {
  const phase = useOnboardingWizardStore((state) => state.phase);
  const progressEvents = useOnboardingWizardStore(
    (state) => state.progressEvents
  );
  const selectedMethod = useOnboardingWizardStore(
    (state) => state.selectedMethod
  );
  const watchNotice = useOnboardingWizardStore((state) => state.watchNotice);
  const onboardingState = useSetupStore((state) => state.onboardingState);
  const {
    finishWizard,
    goBackToConfigure,
    retryWatch,
    setupRunning,
    watchRetryPending,
  } = useOnboardingWizardControllerContext();
  const isWaiting = phase === "progress_waiting_for_config";
  const isSuccess = phase === "progress_success";
  const summary = getProgressSummary(progressEvents);
  const runningDescription =
    selectedMethod === "embedded"
      ? "Starting the embedded PostgreSQL instance, initializing metadata, and writing your final configuration."
      : "Connecting to your database and running the initial metadata setup.";
  const configFilePath =
    onboardingState?.configFilePath ?? "~/.querylane/config.yaml";
  let pageDescription =
    "Your meta database has been configured and initialized successfully.";
  let pageTitle = "You're all set!";
  if (isWaiting) {
    pageDescription =
      "Querylane is watching the config path below. Save your file and setup will continue automatically.";
    pageTitle = "Waiting for configuration";
  } else if (!isSuccess) {
    pageDescription = runningDescription;
    pageTitle = "Setting up Querylane";
  }
  const progressHeader =
    isWaiting || isSuccess ? null : (
      <div aria-live="polite" className="space-y-5">
        <div className="flex items-center justify-between gap-4 text-sm">
          <span className="text-white/70">{summary.statusLabel}</span>
          <span className="font-medium text-white/72">
            {summary.percentage}%
          </span>
        </div>
        <progress
          aria-label="Setup progress"
          aria-valuetext={`${summary.percentage}% — ${summary.statusLabel}`}
          className="block h-3 w-full overflow-hidden rounded-full border-0 bg-white/12 p-0 leading-none [&::-webkit-progress-bar]:bg-white/12 [&::-webkit-progress-value]:rounded-full [&::-webkit-progress-value]:bg-white"
          max={100}
          value={summary.percentage}
        />
      </div>
    );
  return (
    <WizardPage
      description={pageDescription}
      footer={
        <div className="flex items-center justify-between gap-4">
          <Button
            className="h-9 rounded-lg border-white/10 px-4 text-sm text-white/68 hover:bg-white/[0.04] hover:text-white disabled:text-white/25"
            disabled={isSuccess || setupRunning}
            onClick={goBackToConfigure}
            variant="ghost"
          >
            <ArrowLeft className="size-4" />
            Back
          </Button>
          <Button
            className="h-9 rounded-lg bg-white px-4 font-medium text-[#11151f] text-sm hover:bg-white/90 disabled:bg-white/18 disabled:text-white/38"
            disabled={!isSuccess}
            onClick={finishWizard}
          >
            Finish
          </Button>
        </div>
      }
      title={pageTitle}
    >
      <div className="space-y-6">
        {isWaiting ? (
          <WaitingForConfigBody
            configFilePath={configFilePath}
            onRetryWatch={retryWatch}
            retryPending={watchRetryPending}
            watchNotice={watchNotice}
          />
        ) : null}

        {progressHeader}

        <ProgressStepList events={progressEvents} />

        {isSuccess ? <SuccessCallout /> : null}
      </div>
    </WizardPage>
  );
}
