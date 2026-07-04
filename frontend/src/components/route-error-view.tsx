"use client";

import { useQueryClient } from "@tanstack/react-query";
import { type ErrorComponentProps, useRouter } from "@tanstack/react-router";
import { AppErrorView } from "@/components/app-error-view";
import { ChunkLoadRecoveryPage } from "@/components/chunk-load-recovery-page";
import {
  getChunkLoadSessionStorage,
  isChunkLoadError,
  reloadChunkLoadErrorOnce,
} from "@/lib/chunk-load-recovery";
import { normalizeAppUiError } from "@/lib/ui-error";
import { waitForNextFrame } from "@/lib/wait-for-next-frame";

interface RouteErrorViewProps
  extends Pick<ErrorComponentProps, "error" | "reset"> {
  containerClassName?: string | undefined;
  reloadPage?: (() => void) | undefined;
}

function reloadWindow(): void {
  window.location.reload();
}

export function RouteErrorView({
  containerClassName,
  error,
  reloadPage = reloadWindow,
  reset,
}: RouteErrorViewProps) {
  const router = useRouter();
  const queryClient = useQueryClient();

  const retry = async () => {
    await waitForNextFrame();
    await queryClient.refetchQueries({
      predicate: (query) => query.state.status === "error",
    });
    reset();
    await router.invalidate();
  };

  if (isChunkLoadError(error)) {
    const storage = getChunkLoadSessionStorage();
    const autoReloading = storage
      ? reloadChunkLoadErrorOnce({ error, reloadPage, storage })
      : false;

    return (
      <ChunkLoadRecoveryPage
        autoReloading={autoReloading}
        containerClassName={containerClassName}
        reloadPage={reloadPage}
      />
    );
  }

  const uiError = normalizeAppUiError(error, {
    area: "router",
    source: "router",
  });

  return (
    <AppErrorView
      containerClassName={containerClassName}
      error={uiError}
      onRetry={retry}
      retryLabel="Try again"
      variant="page"
    />
  );
}
