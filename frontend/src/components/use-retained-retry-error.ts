"use client";

import { useEffect, useRef, useState } from "react";
import { flushSync } from "react-dom";

interface UseRetainedRetryErrorOptions<Value> {
  error: Value | null | undefined;
  onRetry?: (() => Promise<unknown> | undefined) | undefined;
}

export function useRetainedRetryError<Value>({
  error,
  onRetry,
}: UseRetainedRetryErrorOptions<Value>) {
  const latestError = error ?? null;
  const latestErrorRef = useRef<Value | null>(latestError);
  const [displayedError, setDisplayedError] = useState<Value | null>(
    latestError
  );
  const [retryInFlight, setRetryInFlight] = useState(false);

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
      if (!retryInFlight) {
        setDisplayedError(latestError);
        return;
      }

      if (latestError) {
        setDisplayedError(latestError);
      }
    },
    [latestError, retryInFlight]
  );

  const retry = async () => {
    if (!onRetry || retryInFlight) {
      return;
    }

    flushSync(() => {
      setRetryInFlight(true);
      setDisplayedError((current) => current ?? latestErrorRef.current);
    });

    try {
      await onRetry();
    } catch {
      // The owning surface will expose the refreshed error state.
    }
    setDisplayedError(latestErrorRef.current);
    setRetryInFlight(false);
  };

  return {
    displayedError,
    retry: onRetry ? retry : undefined,
  };
}
