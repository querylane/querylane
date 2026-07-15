"use client";

import { useEffect, useRef, useState } from "react";

interface UseRetainedRetryErrorOptions<Value> {
  error: Value | null | undefined;
  onRetry?: (() => Promise<unknown> | undefined) | undefined;
}

interface RetainedRetryState<Value> {
  displayedError: Value | null;
  retryInFlight: boolean;
}

export function useRetainedRetryError<Value>({
  error,
  onRetry,
}: UseRetainedRetryErrorOptions<Value>) {
  const latestError = error ?? null;
  const latestErrorRef = useRef<Value | null>(latestError);
  const [retryState, setRetryState] = useState<RetainedRetryState<Value>>(
    () => ({
      displayedError: latestError,
      retryInFlight: false,
    })
  );

  // allow-useEffect: keep retry handlers synced with latest error prop
  useEffect(
    function syncLatestRetryError() {
      latestErrorRef.current = latestError;
    },
    [latestError]
  );

  // allow-useEffect: retain error state across retries
  useEffect(
    function retainErrorDuringRetry() {
      if (!retryState.retryInFlight) {
        setRetryState({ displayedError: latestError, retryInFlight: false });
        return;
      }

      if (latestError) {
        setRetryState({ displayedError: latestError, retryInFlight: true });
      }
    },
    [latestError, retryState.retryInFlight]
  );

  const retry = async () => {
    if (!onRetry || retryState.retryInFlight) {
      return;
    }

    setRetryState((current) => ({
      displayedError: current.displayedError ?? latestErrorRef.current,
      retryInFlight: true,
    }));

    try {
      await onRetry();
    } catch {
      // The owning surface will expose the refreshed error state.
    }
    setRetryState({
      displayedError: latestErrorRef.current,
      retryInFlight: false,
    });
  };

  return {
    displayedError: retryState.displayedError,
    retry: onRetry ? retry : undefined,
  };
}
