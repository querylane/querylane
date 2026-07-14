"use client";

import {
  AlertTriangle,
  ChevronDown,
  Copy,
  Download,
  SearchCode,
  Terminal,
} from "lucide-react";
import { lazy, Suspense, useEffect, useId, useState } from "react";
import { RetryActionButton } from "@/components/retry-action-button";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import {
  Collapsible,
  CollapsibleContent,
  CollapsibleTrigger,
} from "@/components/ui/collapsible";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import type { AppUiError } from "@/lib/ui-error-types";
import { cn } from "@/lib/utils";

type AppErrorViewVariant = "inline" | "page";
const COPY_RESET_DELAY_MS = 1500;
const REPRODUCTION_HELPER_TEXT =
  "Reproduction actions require a captured API request.";
const TECHNICAL_DETAILS_REGION_LABEL = "Technical details";

const AppErrorTechnicalDetails = lazy(() =>
  import("@/components/app-error-technical-details").then((module) => ({
    default: module.AppErrorTechnicalDetails,
  }))
);

interface AppErrorViewProps {
  actions?: React.ReactNode | undefined;
  className?: string | undefined;
  containerClassName?: string | undefined;
  error: AppUiError;
  onRetry?: (() => Promise<unknown> | undefined) | undefined;
  retryLabel?: string | undefined;
  variant?: AppErrorViewVariant | undefined;
}
function getErrorSummaryMessage(error: AppUiError): string {
  if (!error.postgres) {
    return error.message;
  }

  const condition = error.postgres.conditionName ?? "postgresql_error";
  return error.postgres.operation
    ? `PostgreSQL ${condition} during ${error.postgres.operation}`
    : `PostgreSQL ${condition}`;
}
function useTransientFeedbackState() {
  const [active, setActive] = useState(false);

  useEffect(
    function resetTransientFeedbackAfterDelay() {
      if (!active) {
        return;
      }
      const timeout = window.setTimeout(() => {
        setActive(false);
      }, COPY_RESET_DELAY_MS);
      return () => {
        window.clearTimeout(timeout);
      };
    },
    [active]
  );
  return [active, () => setActive(true)] as const;
}
async function copyText(value: string): Promise<boolean> {
  try {
    await navigator.clipboard.writeText(value);
    return true;
  } catch {
    return false;
  }
}
function downloadJsonFile(filename: string, payload: unknown): boolean {
  if (typeof document === "undefined" || typeof URL === "undefined") {
    return false;
  }
  const blob = new Blob([JSON.stringify(payload, null, 2)], {
    type: "application/json",
  });
  const url = URL.createObjectURL(blob);
  const anchor = document.createElement("a");
  anchor.download = filename;
  anchor.href = url;
  anchor.click();
  URL.revokeObjectURL(url);
  return true;
}
function CopyErrorDetailsButton({ error }: { error: AppUiError }) {
  const [copied, markCopied] = useTransientFeedbackState();
  return (
    <Button
      onClick={async () => {
        if (await copyText(error.technicalDetailsText)) {
          markCopied();
        }
      }}
      size="sm"
      variant="outline"
    >
      <Copy className="size-4" />
      {copied ? "Copied" : "Copy details"}
    </Button>
  );
}
function CopyAsCurlButton({ error }: { error: AppUiError }) {
  const [copied, markCopied] = useTransientFeedbackState();
  return (
    <Button
      disabled={!error.reproduction}
      onClick={async () => {
        if (!error.reproduction) {
          return;
        }
        if (await copyText(error.reproduction.curlCommand)) {
          markCopied();
        }
      }}
      size="sm"
      variant="outline"
    >
      <Terminal className="size-4" />
      {copied ? "Copied" : "Copy as cURL"}
    </Button>
  );
}
function DownloadReproductionButton({ error }: { error: AppUiError }) {
  const [downloaded, markDownloaded] = useTransientFeedbackState();
  return (
    <Button
      disabled={!error.reproduction}
      onClick={() => {
        if (
          error.reproduction &&
          downloadJsonFile(
            error.reproduction.downloadFilename,
            error.reproduction.downloadPayload
          )
        ) {
          markDownloaded();
        }
      }}
      size="sm"
      variant="outline"
    >
      <Download className="size-4" />
      {downloaded ? "Downloaded" : "Download"}
    </Button>
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
function TechnicalDetailsSection({ error }: { error: AppUiError }) {
  const technicalDetailsId = useId();
  const [technicalDetailsExpanded, setTechnicalDetailsExpanded] =
    useState(true);
  return (
    <div className="rounded-lg border border-border bg-muted/20 p-3">
      <Collapsible
        onOpenChange={setTechnicalDetailsExpanded}
        open={technicalDetailsExpanded}
      >
        <CollapsibleTrigger
          aria-controls={technicalDetailsId}
          className={cn(
            "group/technical-details-trigger flex w-full items-center justify-between gap-3 rounded-md text-left outline-none transition-all hover:underline focus-visible:border-ring focus-visible:ring-3 focus-visible:ring-ring/50"
          )}
        >
          <span className="font-medium text-sm">
            {TECHNICAL_DETAILS_REGION_LABEL}
          </span>
          <ChevronDown className="size-4 shrink-0 text-muted-foreground transition-transform group-aria-expanded/technical-details-trigger:rotate-180" />
        </CollapsibleTrigger>
        <CollapsibleContent className="pt-2">
          <section
            aria-label={TECHNICAL_DETAILS_REGION_LABEL}
            id={technicalDetailsId}
          >
            {technicalDetailsExpanded ? (
              <Suspense
                fallback={
                  <div className="text-muted-foreground text-sm">
                    Loading technical details…
                  </div>
                }
              >
                <AppErrorTechnicalDetails error={error} />
              </Suspense>
            ) : null}
          </section>
        </CollapsibleContent>
      </Collapsible>
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
          <div className="space-y-2">
            <div className="flex flex-wrap gap-2">
              <CopyErrorDetailsButton error={error} />
              <CopyAsCurlButton error={error} />
              <DownloadReproductionButton error={error} />
            </div>
            {error.reproduction ? null : (
              <p className="text-muted-foreground text-xs">
                {REPRODUCTION_HELPER_TEXT}
              </p>
            )}
          </div>
          <TechnicalDetailsSection error={error} key={error.technicalDetails} />
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
  const summaryMessage = getErrorSummaryMessage(error);

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
            <p className="text-muted-foreground text-sm">{summaryMessage}</p>
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
  const summaryMessage = getErrorSummaryMessage(error);

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
              {summaryMessage}
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
