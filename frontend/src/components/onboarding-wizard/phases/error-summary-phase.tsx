import { AlertTriangle, ArrowLeft, RefreshCw, Settings2 } from "lucide-react";
import { AppInlineError } from "@/components/app-error-view";
import {
  useOnboardingWizardActions,
  useOnboardingWizardState,
} from "@/components/onboarding-wizard/onboarding-wizard-state-context";
import { WizardPage } from "@/components/onboarding-wizard/shared/wizard-page";
import { RetryActionButton } from "@/components/retry-action-button";
import { Button } from "@/components/ui/button";
import { waitForNextFrame } from "@/lib/wait-for-next-frame";
import { StepState } from "@/protogen/querylane/console/v1alpha1/onboarding_pb";

/**
 * Patterns that indicate a configuration issue (wrong credentials,
 * unreachable host, etc.) vs a transient/infrastructure issue.
 */
const CONFIG_ERROR_PATTERNS = [
  /password authentication/i,
  /no pg_hba\.conf/i,
  /could not connect/i,
  /connection refused/i,
  /host not found/i,
  /name resolution/i,
  /no such host/i,
  /invalid argument/i,
  /authentication failed/i,
  /role .+ does not exist/i,
  /database .+ does not exist/i,
  /ssl.*required/i,
  /certificate/i,
  /timeout/i,
];
function isLikelyConfigurationError(errorMessage: string): boolean {
  return CONFIG_ERROR_PATTERNS.some((pattern) => pattern.test(errorMessage));
}
export function ErrorSummaryPhase() {
  const { failedEvent, progressEvents, streamError } =
    useOnboardingWizardState();
  const {
    clearStreamFailure,
    goBackToMethodSelection,
    goToConfigure,
    retryFromErrorSummary: retry,
  } = useOnboardingWizardActions();
  const failedStepName = failedEvent?.displayName;
  const failedStepError = failedEvent?.error;
  const succeededCount = progressEvents.filter(
    (e) => e.state === StepState.SUCCEEDED
  ).length;
  const totalCount = progressEvents.length;
  const errorText =
    failedStepError || streamError?.title || "An unknown error occurred";
  const isConfigError = isLikelyConfigurationError(errorText);
  return (
    <WizardPage
      description={
        failedStepName
          ? `Setup failed during "${failedStepName}" (step ${succeededCount + 1} of ${totalCount}). Review the error details below.`
          : "Setup stopped before Querylane could finish configuring the metadata database. Review the error details below and retry when you're ready."
      }
      footer={
        <div className="flex items-center justify-between gap-4">
          <div className="flex items-center gap-2">
            <Button
              className="h-10 rounded-xl border-white/10 px-4 text-sm text-white/78 hover:bg-white/[0.04] hover:text-white"
              onClick={() => {
                clearStreamFailure();
                goBackToMethodSelection();
              }}
              variant="ghost"
            >
              <ArrowLeft className="size-4" />
              Start over
            </Button>
            <Button
              className="h-10 rounded-xl border-white/10 px-4 text-sm text-white/78 hover:bg-white/[0.04] hover:text-white"
              onClick={() => {
                clearStreamFailure();
                goToConfigure();
              }}
              variant="ghost"
            >
              <Settings2 className="size-4" />
              Reconfigure
            </Button>
          </div>
          <RetryActionButton
            className="h-10 rounded-xl bg-white px-4 font-medium text-[#11151f] text-sm hover:bg-white/90"
            label="Retry"
            onRetry={() =>
              waitForNextFrame().then(() => {
                retry();
              })
            }
            pendingLabel="Retrying..."
            variant="default"
          />
        </div>
      }
      title="Setup failed"
    >
      <div className="space-y-5">
        {/* Hint banner for config vs transient errors */}
        {isConfigError ? (
          <div className="flex items-start gap-4 rounded-2xl border border-amber-400/20 bg-amber-500/[0.06] px-4 py-3">
            <AlertTriangle className="mt-0.5 size-4 shrink-0 text-amber-400" />
            <div className="space-y-1">
              <div className="font-medium text-amber-100 text-base">
                Likely a configuration issue
              </div>
              <p className="text-amber-100/70 text-sm">
                This error usually means the connection details need adjusting.
                Click <strong>Reconfigure</strong> to update your settings.
              </p>
            </div>
          </div>
        ) : (
          <div className="flex items-start gap-4 rounded-2xl border border-blue-400/20 bg-blue-500/[0.06] px-4 py-3">
            <RefreshCw className="mt-0.5 size-4 shrink-0 text-blue-400" />
            <div className="space-y-1">
              <div className="font-medium text-base text-blue-100">
                May be a transient issue
              </div>
              <p className="text-blue-100/70 text-sm">
                This could be a temporary problem. Try clicking{" "}
                <strong>Retry</strong> first. If it persists, reconfigure your
                connection.
              </p>
            </div>
          </div>
        )}

        {/* Failed step detail */}
        {failedStepName ? (
          <div className="rounded-2xl border border-red-400/18 bg-red-500/[0.06] px-4 py-3">
            <div className="space-y-2">
              <div className="flex items-center gap-3">
                <span className="rounded-full bg-red-500/18 px-3 py-1 font-medium text-red-200 text-sm">
                  Failed step
                </span>
                <span className="font-medium text-base text-white">
                  {failedStepName}
                </span>
              </div>
              {failedStepError ? (
                <p className="text-red-200/80 text-sm">{failedStepError}</p>
              ) : null}
            </div>
          </div>
        ) : null}

        {streamError ? <AppInlineError error={streamError} /> : null}
      </div>
    </WizardPage>
  );
}
