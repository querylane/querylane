import { createClient } from "@connectrpc/connect";
import { useTransport } from "@connectrpc/connect-query";
import {
  type UseMutationOptions as TanStackUseMutationOptions,
  useMutation as useTanStackMutation,
} from "@tanstack/react-query";
import { useEffect, useRef, useState } from "react";

import {
  consumeSetupStreamWithProgress,
  consumeWatchStreamWithProgress,
  createSetupStreamFailureError,
  type StepProgressCallback,
} from "@/lib/setup-requests";
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

function toError(error: unknown): Error {
  if (error instanceof Error) {
    return error;
  }

  return new Error("Onboarding request failed");
}

function sleep(ms: number): Promise<void> {
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

async function runWatchStreamWithRetries({
  onboardingStreamingClient,
  controller,
  isCancelled,
  onComplete,
  onError,
  onProgress,
  setManualRetryRequired,
}: WatchStreamRunOptions): Promise<void> {
  const runAttempt = async (attempt: number): Promise<void> => {
    if (isCancelled()) {
      return;
    }

    try {
      const setupFailedMessage = await consumeWatchStreamWithProgress(
        onboardingStreamingClient.watchConfigChanges(
          {},
          {
            signal: controller.signal,
            // Long-lived watch stream; timeoutMs: 0 disables the transport's
            // default deadline so it is not severed every 30s.
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
      return;
    } catch (error) {
      if (isCancelled()) {
        return;
      }

      const waitMs = WATCH_RETRY_BACKOFF_MS[attempt];
      if (waitMs !== undefined) {
        await sleep(waitMs);
        await runAttempt(attempt + 1);
        return;
      }

      setManualRetryRequired(true);
      onError?.(toError(error), "stream_error");
      return;
    }
  };

  await runAttempt(0);
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
    mutationFn: async ({ request, signal }) => {
      const setupFailedMessage = await consumeSetupStreamWithProgress(
        onboardingStreamingClient.setupAppDatabase(
          request,
          // Setup (migrations, seeding) may stream progress for longer than
          // the transport's default deadline; timeoutMs: 0 disables it.
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
}: UseWatchConfigChangesOptions): UseWatchConfigChangesResult {
  const onboardingStreamingClient = useOnboardingStreamingClient();
  const [isRunning, setIsRunning] = useState(false);
  const [manualRetryRequired, setManualRetryRequired] = useState(false);
  const [retryPending, setRetryPending] = useState(false);
  const [retryTick, setRetryTick] = useState(0);
  const retryTickRef = useRef(retryTick);
  const retryPromiseRef = useRef<Promise<void> | null>(null);
  const retryResolveRef = useRef<(() => void) | null>(null);
  const onCompleteRef = useRef(onComplete);
  const onErrorRef = useRef(onError);
  const onProgressRef = useRef(onProgress);

  const retry = () => {
    if (retryPromiseRef.current) {
      return retryPromiseRef.current;
    }

    setManualRetryRequired(false);
    setRetryPending(true);

    const retryPromise = new Promise<void>((resolve) => {
      retryResolveRef.current = resolve;
      setRetryTick((prev) => prev + 1);
    });
    retryPromiseRef.current = retryPromise;

    return retryPromise;
  };

  // allow-useEffect: sync form field from server response
  useEffect(() => {
    retryTickRef.current = retryTick;
  }, [retryTick]);

  // allow-useEffect: sync form field from server response
  useEffect(() => {
    onCompleteRef.current = onComplete;
  }, [onComplete]);

  // allow-useEffect: sync form field from server response
  useEffect(() => {
    onErrorRef.current = onError;
  }, [onError]);

  // allow-useEffect: sync form field from server response
  useEffect(() => {
    onProgressRef.current = onProgress;
  }, [onProgress]);

  // allow-useEffect: sync form field from server response
  useEffect(() => {
    if (!enabled) {
      setIsRunning(false);
      setManualRetryRequired(false);
      settleRetryState({
        retryPromiseRef,
        retryResolveRef,
        setRetryPending,
      });
      return;
    }

    let cancelled = false;
    const controller = new AbortController();
    const runId = retryTick;
    setIsRunning(true);
    setManualRetryRequired(false);

    runWatchStreamWithRetries({
      controller,
      isCancelled: () => cancelled || controller.signal.aborted,
      onboardingStreamingClient,
      onComplete: () => {
        settleRetryState({
          retryPromiseRef,
          retryResolveRef,
          setRetryPending,
        });
        onCompleteRef.current?.();
      },
      onError: (error, reason) => {
        settleRetryState({
          retryPromiseRef,
          retryResolveRef,
          setRetryPending,
        });
        onErrorRef.current?.(error, reason);
      },
      onProgress: (event) => {
        settleRetryState({
          retryPromiseRef,
          retryResolveRef,
          setRetryPending,
        });
        onProgressRef.current?.(event);
      },
      setManualRetryRequired,
    })
      .catch((error) => {
        if (!(cancelled || controller.signal.aborted)) {
          setManualRetryRequired(true);
          settleRetryState({
            retryPromiseRef,
            retryResolveRef,
            setRetryPending,
          });
          onErrorRef.current?.(toError(error), "stream_error");
        }
      })
      .finally(() => {
        if (!cancelled && runId === retryTickRef.current) {
          setIsRunning(false);
        }
      });

    return () => {
      cancelled = true;
      controller.abort();
    };
  }, [enabled, onboardingStreamingClient, retryTick]);

  return {
    isRunning,
    manualRetryRequired,
    retry,
    retryPending,
  };
}

export type { SetupAppDatabaseMutationVariables, WatchErrorReason };
export { useSetupAppDatabaseMutation, useWatchConfigChanges };
