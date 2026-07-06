"use client";

import { Spinner } from "@/components/ui/spinner";

interface AsyncSectionStateProps {
  children?: React.ReactNode;
  emptyState?: React.ReactNode | null;
  hasContent: boolean;
  isPending?: boolean;
  isRefreshing?: boolean;
  loadingMessage?: string;
  refreshingMessage?: string;
}

function SectionStatusMessage({
  message,
  tone,
}: {
  message: string;
  tone: "loading" | "refreshing";
}) {
  if (tone === "refreshing") {
    return (
      <output
        aria-live="polite"
        className="mb-3 flex items-center gap-2 text-muted-foreground text-xs"
      >
        <Spinner className="size-3.5" />
        <span>{message}</span>
      </output>
    );
  }

  return (
    <output
      aria-live="polite"
      className="flex min-h-32 items-center justify-center rounded-lg border border-border border-dashed bg-muted/20 px-4 py-6"
    >
      <div className="flex items-center gap-3 text-muted-foreground text-sm">
        <Spinner className="size-4" />
        <span>{message}</span>
      </div>
    </output>
  );
}

export function AsyncSectionState({
  children,
  emptyState = null,
  hasContent,
  isPending = false,
  isRefreshing = false,
  loadingMessage = "Loading...",
  refreshingMessage = "Refreshing...",
}: AsyncSectionStateProps) {
  if (isPending && !hasContent) {
    return <SectionStatusMessage message={loadingMessage} tone="loading" />;
  }

  if (!hasContent) {
    return emptyState;
  }

  return (
    <>
      {isRefreshing ? (
        <SectionStatusMessage message={refreshingMessage} tone="refreshing" />
      ) : null}
      {children}
    </>
  );
}
