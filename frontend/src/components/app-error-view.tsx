"use client";

import { AlertTriangle, Copy, SearchCode } from "lucide-react";
import { useState } from "react";
import { RetryActionButton } from "@/components/retry-action-button";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import { Textarea } from "@/components/ui/textarea";
import type { AppUiError } from "@/lib/ui-error-types";
import { cn } from "@/lib/utils";

type AppErrorViewVariant = "inline" | "page";
type CopyFeedback = "error" | "idle" | "success";

const COPY_FEEDBACK_MESSAGES: Record<CopyFeedback, string> = {
  error: "Couldn't copy details",
  idle: "",
  success: "Details copied",
};

interface AppErrorViewProps {
  actions?: React.ReactNode | undefined;
  className?: string | undefined;
  containerClassName?: string | undefined;
  error: AppUiError;
  onRetry?: (() => Promise<unknown> | undefined) | undefined;
  retryLabel?: string | undefined;
  variant?: AppErrorViewVariant | undefined;
}

function CopyErrorDetailsButton({ error }: { error: AppUiError }) {
  const [feedback, setFeedback] = useState<CopyFeedback>("idle");

  return (
    <div className="flex items-center gap-2">
      <Button
        onClick={async () => {
          setFeedback("idle");
          try {
            if (!navigator.clipboard) {
              throw new Error("Clipboard unavailable");
            }
            await navigator.clipboard.writeText(error.technicalDetails);
            setFeedback("success");
          } catch {
            setFeedback("error");
          }
        }}
        size="sm"
        variant="outline"
      >
        <Copy className="size-4" />
        Copy details
      </Button>
      <p
        aria-live="polite"
        className="text-muted-foreground text-xs"
        role="status"
      >
        {COPY_FEEDBACK_MESSAGES[feedback]}
      </p>
    </div>
  );
}

function ErrorBadge({ label, value }: { label: string; value: string | null }) {
  if (!value) {
    return null;
  }

  return (
    <div className="rounded-full border border-border px-3 py-1 font-mono text-[11px] text-muted-foreground">
      {label}: {value}
    </div>
  );
}

function ErrorBadgeList({
  error,
  retryAvailable,
}: {
  error: AppUiError;
  retryAvailable: boolean;
}) {
  return (
    <div className="flex flex-wrap gap-2">
      <ErrorBadge label="Source" value={error.source} />
      <ErrorBadge label="Code" value={error.codeLabel} />
      <ErrorBadge label="SQLSTATE" value={error.postgres?.sqlstate ?? null} />
      <ErrorBadge
        label="SQLSTATE class"
        value={error.postgres?.sqlstateClass ?? null}
      />
      <ErrorBadge
        label="Condition"
        value={error.postgres?.conditionName ?? null}
      />
      <ErrorBadge label="Operation" value={error.postgres?.operation ?? null} />
      <ErrorBadge label="Reason" value={error.connectReason} />
      <ErrorBadge label="Domain" value={error.connectDomain} />
      <ErrorBadge label="Endpoint" value={error.context.endpoint ?? null} />
      <ErrorBadge label="Blocker" value={error.blockingReason ?? null} />
      <ErrorBadge
        label="Retry available"
        value={retryAvailable ? "yes" : "no"}
      />
    </div>
  );
}

function ErrorDetailsDialog({
  error,
  retryAvailable,
  triggerClassName,
  triggerSize = "sm",
  triggerVariant = "outline",
}: {
  error: AppUiError;
  retryAvailable: boolean;
  triggerClassName?: string | undefined;
  triggerSize?: React.ComponentProps<typeof Button>["size"];
  triggerVariant?: React.ComponentProps<typeof Button>["variant"];
}) {
  return (
    <Dialog>
      <DialogTrigger
        render={
          <Button
            className={triggerClassName}
            size={triggerSize}
            variant={triggerVariant}
          >
            <SearchCode className="size-4" />
            Error details
          </Button>
        }
      />
      <DialogContent className="flex max-h-[85vh] flex-col gap-4 overflow-hidden sm:max-w-3xl">
        <DialogHeader className="shrink-0">
          <DialogTitle>{error.title}</DialogTitle>
          <DialogDescription>{error.message}</DialogDescription>
        </DialogHeader>
        <div className="min-h-0 flex-1 space-y-4 overflow-y-auto pr-1">
          <ErrorBadgeList error={error} retryAvailable={retryAvailable} />
          <CopyErrorDetailsButton error={error} key={error.technicalDetails} />
          <div className="space-y-2">
            <h3 className="font-medium text-sm">Technical details</h3>
            <Textarea
              aria-label="Technical details JSON"
              className="h-96 max-h-96 resize-none whitespace-pre bg-muted/40 font-mono text-muted-foreground text-xs"
              readOnly={true}
              spellCheck={false}
              value={error.technicalDetails}
              wrap="off"
            />
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}

function AppPageError({
  actions,
  className,
  containerClassName,
  error,
  onRetry,
  retryLabel,
}: Omit<AppErrorViewProps, "variant"> & { retryLabel: string }) {
  return (
    <div
      className={cn("flex items-center justify-center p-4", containerClassName)}
    >
      <Card
        className={cn("w-full max-w-lg border-destructive/30", className)}
        role="alert"
      >
        <CardContent className="flex flex-col items-center gap-4 px-6 py-8 text-center">
          <div className="flex size-12 items-center justify-center rounded-full bg-destructive/10">
            <AlertTriangle className="size-6 text-destructive" />
          </div>
          <div className="space-y-1.5">
            <h2 className="font-semibold text-lg tracking-tight">
              {error.title}
            </h2>
            <p className="text-muted-foreground text-sm">{error.summary}</p>
            {error.retryGuidance ? (
              <p className="text-sm">{error.retryGuidance}</p>
            ) : null}
          </div>
          <div className="flex flex-wrap items-center justify-center gap-2">
            {onRetry ? (
              <RetryActionButton label={retryLabel} onRetry={onRetry} />
            ) : null}
            {actions}
            <ErrorDetailsDialog
              error={error}
              retryAvailable={Boolean(onRetry)}
              triggerVariant={onRetry || actions ? "outline" : "default"}
            />
          </div>
        </CardContent>
      </Card>
    </div>
  );
}

function AppCompactError({
  actions,
  className,
  containerClassName,
  error,
  onRetry,
  retryLabel,
}: Omit<AppErrorViewProps, "variant"> & { retryLabel: string }) {
  return (
    <div className={cn("w-full", containerClassName)}>
      <div
        className={cn(
          "rounded-lg border border-destructive/30 bg-destructive/5 p-3",
          className
        )}
        role="alert"
      >
        <div className="flex items-start gap-2.5">
          <AlertTriangle className="mt-0.5 size-4 shrink-0 text-destructive" />
          <div className="min-w-0 flex-1 space-y-1">
            <p className="font-medium text-sm leading-snug">{error.title}</p>
            <p className="line-clamp-3 break-words text-muted-foreground text-xs">
              {error.summary}
            </p>
            {error.retryGuidance ? (
              <p className="text-xs">{error.retryGuidance}</p>
            ) : null}
            <div className="flex flex-wrap items-center gap-1.5 pt-1.5">
              {onRetry ? (
                <RetryActionButton
                  label={retryLabel}
                  onRetry={onRetry}
                  size="sm"
                  variant="outline"
                />
              ) : null}
              {actions}
              <ErrorDetailsDialog
                error={error}
                retryAvailable={Boolean(onRetry)}
                triggerClassName={onRetry || actions ? undefined : "-ml-2.5"}
                triggerVariant="ghost"
              />
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}

export function AppErrorView({
  variant = "inline",
  retryLabel = "Retry",
  ...props
}: AppErrorViewProps) {
  if (variant === "page") {
    return <AppPageError {...props} retryLabel={retryLabel} />;
  }
  return <AppCompactError {...props} retryLabel={retryLabel} />;
}

export function AppInlineError(props: Omit<AppErrorViewProps, "variant">) {
  return <AppErrorView {...props} variant="inline" />;
}
