"use client";

import { RefreshCw } from "lucide-react";
import { useEffect, useId, useRef, useState } from "react";

import { Button } from "@/components/ui/button";
import { Spinner } from "@/components/ui/spinner";

interface RetryActionButtonProps {
  className?: string;
  label: string;
  onRetry: () => Promise<unknown> | undefined;
  pendingLabel?: string;
  size?: React.ComponentProps<typeof Button>["size"];
  variant?: React.ComponentProps<typeof Button>["variant"];
}

export function RetryActionButton({
  className,
  label,
  onRetry,
  pendingLabel = "Retrying...",
  size = "sm",
  variant = "default",
}: RetryActionButtonProps) {
  const [retryPending, setRetryPending] = useState(false);
  const [retryError, setRetryError] = useState<string | null>(null);
  const retryErrorId = useId();
  const mountedRef = useRef(true);

  // allow-useEffect: track mounted state so late-settling retries don't set
  // state after unmount. Setting the ref true on mount is required: under
  // StrictMode the effect runs mount → cleanup → mount, and without this the
  // cleanup would leave the ref permanently false, wedging the pending state.
  useEffect(function trackMountedState() {
    mountedRef.current = true;
    return () => {
      mountedRef.current = false;
    };
  }, []);

  const handleRetry = () => {
    if (retryPending) {
      return;
    }

    setRetryPending(true);
    setRetryError(null);
    Promise.resolve()
      .then(() => onRetry())
      .catch((error: unknown) => {
        if (mountedRef.current) {
          setRetryError(
            error instanceof Error
              ? error.message
              : "Retry failed. Try again or refresh the page."
          );
        }
      })
      .finally(() => {
        if (mountedRef.current) {
          setRetryPending(false);
        }
      });
  };

  return (
    <span className="inline-flex flex-col items-start gap-1">
      <Button
        aria-describedby={retryError ? retryErrorId : undefined}
        className={className}
        disabled={retryPending}
        onClick={handleRetry}
        size={size}
        variant={variant}
      >
        {retryPending ? (
          <Spinner aria-hidden="true" className="size-4" />
        ) : (
          <RefreshCw className="size-4" />
        )}
        {retryPending ? pendingLabel : label}
      </Button>
      {retryError ? (
        <span
          className="text-destructive text-xs"
          id={retryErrorId}
          role="alert"
        >
          {retryError}
        </span>
      ) : null}
    </span>
  );
}
