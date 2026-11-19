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

    function finishRetry() {
      setRetryState({ retainedError: null, retryInFlight: false });
    }

    try {
      await onRetry();
    } catch {
      finishRetry();
      return;
    }
    finishRetry();
  };

  return {
    displayedError: retryState.retryInFlight
      ? (latestError ?? retryState.retainedError)
      : latestError,
    retry: onRetry ? retry : undefined,
  };
}
