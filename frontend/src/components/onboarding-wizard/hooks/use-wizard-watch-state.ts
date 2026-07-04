import { WATCH_NOTICE_MESSAGE } from "@/components/onboarding-wizard/constants";
import {
  useWatchConfigChanges,
  type WatchErrorReason,
} from "@/hooks/api/onboarding";
import type { StepProgressCallback } from "@/lib/setup-requests";
import { normalizeAppUiError } from "@/lib/ui-error";
import type { AppUiError } from "@/lib/ui-error-types";

interface UseWizardWatchStateOptions {
  enabled: boolean;
  handleProgressEvent: StepProgressCallback;
  onSuccess: () => void;
  setStreamFailure: (error: AppUiError) => void;
  setWatchNotice: (notice: string | null) => void;
}

export function useWizardWatchState({
  enabled,
  handleProgressEvent,
  onSuccess,
  setStreamFailure,
  setWatchNotice,
}: UseWizardWatchStateOptions) {
  return useWatchConfigChanges({
    enabled,
    onComplete: () => {
      onSuccess();
    },
    onError: (error: Error, reason: WatchErrorReason) => {
      if (reason === "failed_step") {
        setStreamFailure(
          normalizeAppUiError(error, {
            area: "onboarding-watch",
            source: "setup_stream",
          })
        );
        return;
      }

      setWatchNotice(WATCH_NOTICE_MESSAGE);
    },
    onProgress: handleProgressEvent,
  });
}
