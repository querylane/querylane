import { createClient } from "@connectrpc/connect";
import { useTransport } from "@connectrpc/connect-query";
import {
  type UseMutationOptions as TanStackUseMutationOptions,
  useMutation as useTanStackMutation,
} from "@tanstack/react-query";
import { useEffect, useEffectEvent, useRef, useState } from "react";

import { isAlreadyConfigured, toConnectError } from "@/lib/connect-errors";
import {
  consumeSetupStreamWithProgress,
  consumeWatchStreamWithProgress,
  createSetupStreamFailureError,
  type StepProgressCallback,
} from "@/lib/setup-requests";
import { handleAsyncAction } from "@/lib/ui-action";
import {
  OnboardingService,
  type SetupAppDatabaseRequest,
} from "@/protogen/querylane/console/v1alpha1/onboarding_pb";

const WATCH_RETRY_BACKOFF_INITIAL_MS = 500;
const WATCH_RETRY_BACKOFF_SECOND_MS = 1000;
const WATCH_RETRY_BACKOFF_THIRD_MS = 2000;
const WATCH_RETRY_BACKOFF_MS = [
  WATCH_RETRY_BACKOFF_INITIAL_MS,
  WATCH_RETRY_BACKOFF_SECOND_MS,
  WATCH_RETRY_BACKOFF_THIRD_MS,
] as const;

function toError(error: unknown) {
  if (error instanceof Error) {
    return error;
  }

  return new Error("Onboarding request failed");
}

function sleep(ms: number) {
  return new Promise((resolve) => {
    setTimeout(resolve, ms);
  });
}

interface SetupAppDatabaseMutationVariables {
  request: SetupAppDatabaseRequest;
  signal?: AbortSignal;
}

interface UseSetupAppDatabaseMutationOptions
  extends Omit<
    TanStackUseMutationOptions<void, Error, SetupAppDatabaseMutationVariables>,
    "mutationFn"
  > {
  onProgress?: StepProgressCallback;
}

type WatchErrorReason = "failed_step" | "stream_error";

interface UseWatchConfigChangesOptions {
  enabled: boolean;
  onComplete?: () => void;
  onError?: (error: Error, reason: WatchErrorReason) => void;
  onProgress?: StepProgressCallback;
}

interface UseWatchConfigChangesResult {
  isRunning: boolean;
  manualRetryRequired: boolean;
  retry: () => Promise<void>;
  retryPending: boolean;
}

interface WatchStreamRunOptions {
  controller: AbortController;
  isCancelled: () => boolean;
  onboardingStreamingClient: ReturnType<typeof useOnboardingStreamingClient>;
  onComplete?: () => void;
  onError?: (error: Error, reason: WatchErrorReason) => void;
  onProgress?: StepProgressCallback;
  setManualRetryRequired: (required: boolean) => void;
}

async function runWatchStreamWithRetries(options: WatchStreamRunOptions) {
  await runWatchAttempt(options, 0);
}

async function runWatchAttempt(
  options: WatchStreamRunOptions,
  attempt: number
) {
  const {
    onboardingStreamingClient,
    controller,
    isCancelled,
    onComplete,
    onError,
    onProgress,
    setManualRetryRequired,
  } = options;
  if (isCancelled()) {
    return;
  }

  try {
    const setupFailedMessage = await consumeWatchStreamWithProgress(
      onboardingStreamingClient.watchConfigChanges(
        {},
        {
          signal: controller.signal,
          timeoutMs: 0,
        }
      ),
      (event) => onProgress?.(event)
    );
    if (setupFailedMessage) {
      onError?.(
        createSetupStreamFailureError(setupFailedMessage),
        "failed_step"
      );
      return;
    }
    onComplete?.();
  } catch (error) {
    if (isCancelled()) {
      return;
    }

    if (isAlreadyConfigured(toConnectError(error))) {
      onComplete?.();
      return;
    }

    const waitMs = WATCH_RETRY_BACKOFF_MS[attempt];
    if (waitMs !== undefined) {
      await sleep(waitMs);
      await runWatchAttempt(options, attempt + 1);
      return;
    }

    setManualRetryRequired(true);
    onError?.(toError(error), "stream_error");
  }
}

function settleRetryState({
  retryPromiseRef,
  retryResolveRef,
  setRetryPending,
}: {
  retryPromiseRef: { current: Promise<void> | null };
  retryResolveRef: { current: (() => void) | null };
  setRetryPending: (pending: boolean) => void;
}) {
  setRetryPending(false);

  const resolve = retryResolveRef.current;
  retryResolveRef.current = null;
  retryPromiseRef.current = null;
  resolve?.();
}

function useOnboardingStreamingClient() {
  const transport = useTransport();
  return createClient(OnboardingService, transport);
}

function useSetupAppDatabaseMutation(
  options?: UseSetupAppDatabaseMutationOptions
) {
  const onboardingStreamingClient = useOnboardingStreamingClient();

  return useTanStackMutation<void, Error, SetupAppDatabaseMutationVariables>({
    ...options,
    meta: {
      ...options?.meta,
      appErrorSurface: "silent",
    },
    mutationFn: async ({ request, signal }) => {
      const setupFailedMessage = await consumeSetupStreamWithProgress(
        onboardingStreamingClient.setupAppDatabase(
          request,
          signal === undefined ? { timeoutMs: 0 } : { signal, timeoutMs: 0 }
        ),
        (event) => options?.onProgress?.(event)
      );

      if (setupFailedMessage) {
        throw createSetupStreamFailureError(setupFailedMessage);
      }
    },
  });
}

function useWatchConfigChanges({
  enabled,
  onComplete,
  onError,
  onProgress,
}: UseWatchConfigChangesOptions) {
  const onboardingStreamingClient = useOnboardingStreamingClient();
  const [run, setRun] = useState({
    enabled,
    tick: 0,
    isRunning: enabled,
    manualRetryRequired: false,
  });
  const [retryPending, setRetryPending] = useState(false);
  const [retryTick, setRetryTick] = useState(0);
  if (run.enabled !== enabled || run.tick !== retryTick) {
    setRun({
      enabled,
      tick: retryTick,
      isRunning: enabled,
      manualRetryRequired: false,
    });
  }
  const { isRunning, manualRetryRequired } = run;
  const setManualRetryRequired = useEffectEvent((required: boolean) => {
    setRun((current) => ({ ...current, manualRetryRequired: required }));
  });
  const retryTickRef = useRef(retryTick);
  const retryPromiseRef = useRef<Promise<void> | null>(null);
  const retryResolveRef = useRef<(() => void) | null>(null);
  const handleComplete = useEffectEvent(() => onComplete?.());
  const handleError = useEffectEvent((error: Error, reason: WatchErrorReason) =>
    onError?.(error, reason)
  );
  const handleProgress = useEffectEvent(
    (event: Parameters<StepProgressCallback>[0]) => onProgress?.(event)
  );

  const retry = () => {
    if (retryPromiseRef.current) {
      return retryPromiseRef.current;
    }

    setRetryPending(true);

    const retryPromise = new Promise<void>((resolve) => {
      retryResolveRef.current = resolve;
      setRetryTick((prev) => prev + 1);
    });
    retryPromiseRef.current = retryPromise;

    return retryPromise;
  };

  useEffect(() => {
    retryTickRef.current = retryTick;
  }, [retryTick]);

  useEffect(() => {
    if (!enabled) {
      settleRetryState({
        retryPromiseRef,
        retryResolveRef,
        setRetryPending,
      });
      return undefined;
    }

    const controller = new AbortController();
    const runId = retryTick;

    handleAsyncAction(() =>
      runWatchStreamWithRetries({
        controller,
        isCancelled: () => controller.signal.aborted,
        onboardingStreamingClient,
        onComplete: () => {
          settleRetryState({
            retryPromiseRef,
            retryResolveRef,
            setRetryPending,
          });
          handleComplete();
        },
        onError: (error, reason) => {
          settleRetryState({
            retryPromiseRef,
            retryResolveRef,
            setRetryPending,
          });
          handleError(error, reason);
        },
        onProgress: (event) => {
          settleRetryState({
            retryPromiseRef,
            retryResolveRef,
            setRetryPending,
          });
          handleProgress(event);
        },
        setManualRetryRequired,
      })
        .catch((error: unknown) => {
          if (!controller.signal.aborted) {
            setManualRetryRequired(true);
            settleRetryState({
              retryPromiseRef,
              retryResolveRef,
              setRetryPending,
            });
            handleError(toError(error), "stream_error");
          }
        })
        .finally(() => {
          if (!controller.signal.aborted && runId === retryTickRef.current) {
            setRun((current) => ({ ...current, isRunning: false }));
          }
        })
    )();

    return (() => {
      controller.abort();
    }) satisfies (() => void) | undefined;
  }, [enabled, onboardingStreamingClient, retryTick]);

  return {
    isRunning,
    manualRetryRequired,
    retry,
    retryPending,
  } satisfies UseWatchConfigChangesResult;
}

export type { SetupAppDatabaseMutationVariables, WatchErrorReason };
export { useSetupAppDatabaseMutation, useWatchConfigChanges };
