"use client";

import { useLocation } from "@tanstack/react-router";
import type React from "react";
import { useEffect, useRef } from "react";

import { AppErrorView } from "@/components/app-error-view";
import { AppShellFrame } from "@/components/app-shell-frame";
import { BrandedLoadingState } from "@/components/branded-loading-state";
import { useRetainedRetryError } from "@/components/use-retained-retry-error";
import { captureException } from "@/lib/observability/sentry";
import { getBlockingRoutePath, normalizeAppUiError } from "@/lib/ui-error";
import type { AppUiError } from "@/lib/ui-error-types";
import { useBlockingErrorStore } from "@/stores/blocking-error-store";
import { useSetupStore } from "@/stores/setup-store";

const GENERIC_ERROR_TITLES = new Set(["Unexpected error", "Request failed"]);

/**
 * Boot errors mean the frontend loaded but could not talk to the Querylane
 * server. When normalization produced only a generic title, reframe it as a
 * connectivity problem; specific titles (e.g. meta database unavailable) are
 * kept as-is. The original message stays visible in the details dialog.
 */
function presentBootError(error: AppUiError): AppUiError {
  if (!GENERIC_ERROR_TITLES.has(error.title)) {
    return error;
  }
  return {
    ...error,
    message:
      "The interface loaded, but the Querylane server is not responding. If it was just started, it may still be booting.",
    retryGuidance: null,
    title: "Cannot reach the Querylane server",
  };
}

function FullscreenMessage({
  action,
  description,
  title,
}: {
  action?: React.ReactNode | undefined;
  description?: string | undefined;
  title: string;
}) {
  return (
    <div
      aria-live="polite"
      className="flex min-h-screen items-center justify-center p-4"
    >
      <div className="max-w-md space-y-4 text-center">
        <h1 className="font-semibold text-2xl">{title}</h1>
        {description ? (
          <p className="text-muted-foreground text-sm">{description}</p>
        ) : null}
        {action}
      </div>
    </div>
  );
}

export function BootGate({ children }: { children: React.ReactNode }) {
  const bootError = useSetupStore((state) => state.bootError);
  const bootstrap = useSetupStore((state) => state.bootstrap);
  const retryBootstrap = useSetupStore((state) => state.retryBootstrap);
  const status = useSetupStore((state) => state.status);
  const blockingError = useBlockingErrorStore((state) => state.blockingError);
  const bootstrappedRef = useRef(false);
  const blockingRoute = getBlockingRoutePath(
    blockingError?.blockingReason ?? null
  );
  const pathname = useLocation({
    select: (location) => location.pathname,
  });
  const fallbackBootError = normalizeAppUiError(
    new Error("Cannot connect to server"),
    {
      area: "boot-gate",
      source: "boot",
    }
  );
  const activeBootError =
    status === "boot_error" ? (bootError ?? fallbackBootError) : null;
  const { displayedError, retry } = useRetainedRetryError({
    error: activeBootError,
    onRetry: retryBootstrap,
  });

  // allow-useEffect: initialize app on mount
  useEffect(() => {
    if (bootstrappedRef.current) {
      return;
    }
    bootstrappedRef.current = true;
    bootstrap().catch((error) => captureException(error));
  }, [bootstrap]);

  if (status === "boot_error" && blockingRoute && pathname === blockingRoute) {
    return <>{children}</>;
  }

  if (displayedError) {
    return (
      <AppShellFrame>
        <AppErrorView
          error={presentBootError(displayedError)}
          onRetry={retry}
          retryLabel="Retry"
          variant="page"
        />
      </AppShellFrame>
    );
  }

  if (status === "booting") {
    return (
      <BrandedLoadingState
        description="Connecting to Querylane"
        title="Loading Querylane"
        variant="fullscreen"
      />
    );
  }

  if (status === "verifying") {
    return (
      <BrandedLoadingState
        description="Verifying configuration…"
        title="Finalizing setup"
        variant="fullscreen"
      />
    );
  }

  if (status === "onboarding") {
    if (pathname === "/setup") {
      return <>{children}</>;
    }

    return (
      <FullscreenMessage
        description="Querylane needs setup before you can continue."
        title="Redirecting to setup"
      />
    );
  }

  return <>{children}</>;
}
