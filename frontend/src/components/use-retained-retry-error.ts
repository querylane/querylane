"use client";

import { useEffect, useRef, useState } from "react";

interface UseRetainedRetryErrorOptions<Value> {
  error: Value | null | undefined;
  onRetry?: (() => Promise<unknown> | undefined) | undefined;
}

interface RetainedRetryState<Value> {
  retainedError: Value | null;
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
      retainedError: null,
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

  const retry = async () => {
    if (!onRetry || retryState.retryInFlight) {
      return;
    }

    setRetryState((current) => ({
      retainedError: current.retainedError ?? latestErrorRef.current,
      retryInFlight: true,
    }));

    try {
      await onRetry();
    } catch {
      // The owning surface will expose the refreshed error state.
    }
    setRetryState({
      retainedError: null,
      retryInFlight: false,
    });
  };

  return {
    displayedError: retryState.retryInFlight
      ? (latestError ?? retryState.retainedError)
      : latestError,
    retry: onRetry ? retry : undefined,
  };
}
