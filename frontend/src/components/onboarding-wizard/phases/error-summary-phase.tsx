import { AlertTriangle, ArrowLeft, RefreshCw, Settings2 } from "lucide-react";
import { AppInlineError } from "@/components/app-error-view";
import { DEFAULT_CONFIG_FILE_PATH } from "@/components/config-managed-guidance";
import { WizardPage } from "@/components/onboarding-wizard/shared/wizard-page";
import { Button } from "@/components/querylane-ui/button";
import { RetryActionButton } from "@/components/retry-action-button";
import type { AppUiError } from "@/lib/ui-error-types";
import { waitForNextFrame } from "@/lib/wait-for-next-frame";
import { useOnboardingWizardStore } from "@/stores/onboarding-wizard-store";
import { useSetupStore } from "@/stores/setup-store";

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
  /needs CREATE privileges/i,
  /port \d+ is already in use/i,
  /ssl.*required/i,
  /certificate/i,
  /timeout/i,
];
const STORAGE_FULL_PATTERNS = [
  /no space left on device/i,
  /\benospc\b/i,
  /disk (?:is )?full/i,
  /not enough (?:disk )?space/i,
];

function isLikelyConfigurationError(errorMessage: string): boolean {
  return CONFIG_ERROR_PATTERNS.some((pattern) => pattern.test(errorMessage));
}

function isStorageFullError(errorMessage: string): boolean {
  return STORAGE_FULL_PATTERNS.some((pattern) => pattern.test(errorMessage));
}

type SetupErrorKind = "configuration" | "storage_full" | "transient";

function classifySetupError(errorText: string): SetupErrorKind {
  if (isStorageFullError(errorText)) {
    return "storage_full";
  }
  if (isLikelyConfigurationError(errorText)) {
    return "configuration";
  }
  return "transient";
}

function presentStreamError(
  streamError: AppUiError | null,
  errorKind: SetupErrorKind
): AppUiError | null {
  if (!(streamError && errorKind === "storage_full")) {
    return streamError;
  }

  return {
    ...streamError,
    retryGuidance:
      "Free disk space where Querylane stores embedded PostgreSQL data, then retry.",
    summary: "Embedded PostgreSQL could not write its data.",
    title: "Storage full",
  };
}

function buildSetupFailureDescription({
  failedStepIndex,
  failedStepName,
  totalCount,
}: {
  failedStepIndex: number;
  failedStepName: string | undefined;
  totalCount: number;
}) {
  if (!failedStepName) {
    return "Setup stopped before Querylane could finish configuring the metadata database. Review the error details below and retry when you're ready.";
  }
  const position =
    failedStepIndex >= 0
      ? ` (step ${failedStepIndex + 1} of ${totalCount})`
      : "";
  return `Setup failed during "${failedStepName}"${position}. Review the error details below.`;
}

function SetupErrorHint({ errorKind }: { errorKind: SetupErrorKind }) {
  if (errorKind === "storage_full") {
    return null;
  }

  if (errorKind === "configuration") {
    return (
      <div className="flex items-start gap-4 rounded-xl border border-warning-400/20 bg-warning-500/6 px-4 py-3">
        <AlertTriangle className="mt-0.5 size-4 shrink-0 text-warning-400" />
        <div className="space-y-1">
          <div className="font-medium text-base text-warning-100">
            Likely a configuration issue
          </div>
          <p className="text-sm text-warning-100/70">
            This error usually means the connection details need adjusting.
            Click <strong>Reconfigure</strong> to update your settings.
          </p>
        </div>
      </div>
    );
  }

  return (
    <div className="flex items-start gap-4 rounded-xl border border-info-400/20 bg-info-500/6 px-4 py-3">
      <RefreshCw className="mt-0.5 size-4 shrink-0 text-info-400" />
      <div className="space-y-1">
        <div className="font-medium text-base text-info-100">
          May be a transient issue
        </div>
        <p className="text-info-100/70 text-sm">
          This could be a temporary problem. Try clicking <strong>Retry</strong>{" "}
          first. If it persists, reconfigure your connection.
        </p>
      </div>
    </div>
  );
}

function ErrorSummaryFooter({
  clearStreamFailure,
  errorKind,
  goBackToMethodSelection,
  goToConfigure,
  retry,
}: {
  clearStreamFailure: () => void;
  errorKind: SetupErrorKind;
  goBackToMethodSelection: () => void;
  goToConfigure: () => void;
  retry: () => void;
}) {
  return (
    <div className="flex items-center justify-between gap-4">
      <div className="flex items-center gap-2">
        <Button
          className="h-9"
          onClick={() => {
            clearStreamFailure();
            goBackToMethodSelection();
          }}
          presentation="onboarding-secondary"
          variant="ghost"
        >
          <ArrowLeft className="size-4" />
          Start over
        </Button>
        {errorKind === "storage_full" ? null : (
          <Button
            className="h-9"
            onClick={() => {
              clearStreamFailure();
              goToConfigure();
            }}
            presentation="onboarding-secondary"
            variant="ghost"
          >
            <Settings2 className="size-4" />
            Reconfigure
          </Button>
        )}
      </div>
      <RetryActionButton
        className="h-9"
        label="Retry"
        onRetry={() =>
          waitForNextFrame().then(() => {
            retry();
          })
        }
        pendingLabel="Retrying…"
        presentation="onboarding-primary"
        variant="default"
      />
    </div>
  );
}

export function ErrorSummaryPhase() {
  const goToConfigure = useOnboardingWizardStore(
    (state) => state.goToConfigure
  );
  const goBackToMethodSelection = useOnboardingWizardStore(
    (state) => state.goBackToMethodSelection
  );
  const retry = useOnboardingWizardStore(
    (state) => state.retryFromErrorSummary
  );
  const clearStreamFailure = useOnboardingWizardStore(
    (state) => state.clearStreamFailure
  );
  const streamError = useOnboardingWizardStore((state) => state.streamError);
  const failedEvent = useOnboardingWizardStore((state) => state.failedEvent);
  const progressEvents = useOnboardingWizardStore(
    (state) => state.progressEvents
  );
  const configFilePath = useSetupStore(
    (state) => state.onboardingState?.configFilePath || DEFAULT_CONFIG_FILE_PATH
  );
  const failedStepName = failedEvent?.displayName;
  const failedStepError = failedEvent?.error;
  // Position of the failed step in the pipeline. Counting succeeded steps
  // instead would over-report when steps succeed after the failure (the
  // backend can retry on the same stream).
  const failedStepIndex = failedEvent
    ? progressEvents.findIndex((e) => e.stepId === failedEvent.stepId)
    : -1;
  const totalCount = progressEvents.length;
  const errorText =
    failedStepError || streamError?.title || "An unknown error occurred";
  const errorKind = classifySetupError(errorText);
  const presentedStreamError = presentStreamError(streamError, errorKind);

  return (
    <WizardPage
      description={buildSetupFailureDescription({
        failedStepIndex,
        failedStepName,
        totalCount,
      })}
      footer={
        <ErrorSummaryFooter
          clearStreamFailure={clearStreamFailure}
          errorKind={errorKind}
          goBackToMethodSelection={goBackToMethodSelection}
          goToConfigure={goToConfigure}
          retry={retry}
        />
      }
      title="Setup failed"
    >
      <div className="space-y-5">
        <SetupErrorHint errorKind={errorKind} />

        {/* Failed step detail */}
        {failedStepName ? (
          <div className="rounded-xl border border-negative-400/18 bg-negative-500/6 px-4 py-3">
            <div className="space-y-2">
              <div className="flex items-center gap-3">
                <span className="rounded-full bg-negative-500/18 px-3 py-1 font-medium text-negative-200 text-sm">
                  Failed step
                </span>
                <span className="font-medium text-base text-white">
                  {failedStepName}
                </span>
              </div>
              {failedStepError && errorKind !== "storage_full" ? (
                <p className="text-negative-200/80 text-sm">
                  {failedStepError}
                </p>
              ) : null}
            </div>
          </div>
        ) : null}

        {presentedStreamError ? (
          <AppInlineError
            error={presentedStreamError}
            reportBug={errorKind !== "storage_full"}
          />
        ) : null}

        {errorKind === "storage_full" ? null : (
          <div className="space-y-2 rounded-xl border border-border bg-muted/30 px-4 py-3">
            <div className="font-medium text-foreground text-sm">
              Configuration file
            </div>
            <code className="block break-all rounded-lg bg-muted px-3 py-2 text-muted-foreground text-xs">
              {configFilePath}
            </code>
            <p className="text-muted-foreground text-sm leading-6">
              Use <strong>Start over</strong> to choose another storage method
              or <strong>Reconfigure</strong> to update this connection.
            </p>
          </div>
        )}
      </div>
    </WizardPage>
  );
}
