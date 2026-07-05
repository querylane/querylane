"use client";

import { Code } from "@connectrpc/connect";
import { Database } from "lucide-react";
import { AppErrorView } from "@/components/app-error-view";
import { BrandedLoadingState } from "@/components/branded-loading-state";
import { EmptyState } from "@/components/empty-state";
import { NotFoundState } from "@/components/not-found-state";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { CopyIconButton } from "@/components/ui/copy-icon-button";
import { OverflowTooltip } from "@/components/ui/overflow-tooltip";
import { Progress } from "@/components/ui/progress";
import { Spinner } from "@/components/ui/spinner";
import { useRetainedRetryError } from "@/components/use-retained-retry-error";
import { normalizeAppUiError } from "@/lib/ui-error";

interface SummaryCardProps {
  label: string;
  value: React.ReactNode;
}
interface MetadataItem {
  label: string;
  value: React.ReactNode;
}
interface SectionCardProps {
  action?: React.ReactNode | undefined;
  children: React.ReactNode;
  description?: string | undefined;
  title: string;
}
interface ResourcePageStateProps {
  area: string;
  children: React.ReactNode;
  error?: unknown | undefined;
  hasData: boolean;
  loading: boolean;
  notFoundState?: React.ReactNode | undefined;
  retry?: () => Promise<unknown> | undefined;
  title: string;
}
export function SummaryCard({ label, value }: SummaryCardProps) {
  return (
    <Card className="h-16 border-border" size="sm">
      <CardContent className="flex h-full flex-col justify-center gap-y-1 px-4 py-0">
        <p className="text-muted-foreground text-xs uppercase tracking-wide">
          {label}
        </p>
        <div className="flex min-h-6 items-center font-semibold text-base">
          {value}
        </div>
      </CardContent>
    </Card>
  );
}
export function SummaryCountValue({
  count,
  error,
  isPending,
  isUnavailable = false,
}: {
  count: number;
  error?: unknown | undefined;
  isPending: boolean;
  isUnavailable?: boolean | undefined;
}) {
  if (error || isUnavailable) {
    return "—";
  }
  if (isPending) {
    return (
      <span className="flex items-center gap-2 text-muted-foreground text-sm">
        <Spinner className="size-4" />
        <span>Loading…</span>
      </span>
    );
  }
  return count.toLocaleString();
}
export function InstanceStatsBar({ children }: { children: React.ReactNode }) {
  return (
    <div className="grid grid-cols-2 divide-x divide-border rounded-lg border border-border lg:grid-cols-4">
      {children}
    </div>
  );
}
export function InstanceStatItem({
  children,
  label,
  notice,
  progress,
  suffix,
  trend,
}: {
  children: React.ReactNode;
  label: string;
  notice?: React.ReactNode | undefined;
  progress?: number | undefined;
  suffix?: string | undefined;
  /** An optional trend glyph (e.g. a sparkline) right-aligned to the value. */
  trend?: React.ReactNode | undefined;
}) {
  return (
    <div className="flex flex-col gap-1 px-4 py-3.5">
      <span className="text-muted-foreground text-xs">{label}</span>
      <div className="flex min-h-7 items-center gap-1.5">
        <div className="flex items-baseline gap-1.5">
          {children}
          {suffix ? (
            <span className="font-mono text-muted-foreground text-xs tabular-nums">
              {suffix}
            </span>
          ) : null}
        </div>
        {trend ? (
          <div aria-hidden="true" className="ml-auto h-7 w-20 shrink-0">
            {trend}
          </div>
        ) : null}
      </div>
      {progress == null ? null : (
        <Progress className="gap-0" value={progress} />
      )}
      {notice ? (
        <div className="text-[11px] text-amber-600 leading-snug dark:text-amber-400">
          {notice}
        </div>
      ) : null}
    </div>
  );
}
export function CopyableHost({ host, port }: { host: string; port?: number }) {
  const fullHost = port ? `${host}:${port}` : host;
  return (
    <span className="inline-flex min-w-0 max-w-full items-center gap-1">
      <OverflowTooltip
        className="min-w-0 max-w-[min(18rem,calc(100vw-6rem))] truncate font-mono text-foreground text-xs"
        forceTooltip={true}
        tooltipContent={fullHost}
      >
        {fullHost}
      </OverflowTooltip>
      <CopyIconButton
        ariaLabel="Copy host address"
        size="icon-xs"
        value={fullHost}
      />
    </span>
  );
}
export function PageHeader({
  description,
  eyebrow,
  title,
}: {
  description?: string | undefined;
  eyebrow: string;
  title: string;
}) {
  return (
    <div className="min-w-0 max-w-full space-y-2">
      <p className="text-muted-foreground text-xs uppercase tracking-[0.24em]">
        {eyebrow}
      </p>
      <div className="space-y-1">
        <h1 className="break-words font-semibold text-2xl tracking-tight [overflow-wrap:anywhere] sm:text-3xl">
          {title}
        </h1>
        {description ? (
          <p className="max-w-3xl text-muted-foreground">{description}</p>
        ) : null}
      </div>
    </div>
  );
}
export function SectionCard({
  action,
  children,
  description,
  title,
}: SectionCardProps) {
  return (
    <Card className="border-border">
      <CardHeader className="flex flex-col items-start justify-between gap-4 sm:flex-row">
        <div className="min-w-0 space-y-1">
          <CardTitle>{title}</CardTitle>
          {description ? (
            <p className="text-muted-foreground text-sm">{description}</p>
          ) : null}
        </div>
        {action}
      </CardHeader>
      <CardContent>{children}</CardContent>
    </Card>
  );
}
export function MetadataCard({
  items,
  title,
}: {
  items: MetadataItem[];
  title: string;
}) {
  return (
    <Card className="border-border" size="sm">
      <CardHeader className="px-4">
        <CardTitle>{title}</CardTitle>
      </CardHeader>
      <CardContent className="px-4">
        <dl className="grid gap-x-6 gap-y-2 md:grid-cols-3">
          {items.map((item) => (
            <div className="min-w-0 space-y-1" key={item.label}>
              <dt className="text-muted-foreground text-xs uppercase tracking-wide">
                {item.label}
              </dt>
              <dd className="min-w-0 break-words text-sm [overflow-wrap:anywhere]">
                {item.value}
              </dd>
            </div>
          ))}
        </dl>
      </CardContent>
    </Card>
  );
}
export function ResourcePageState({
  area,
  children,
  error,
  hasData,
  loading,
  notFoundState,
  retry,
  title,
}: ResourcePageStateProps) {
  const { displayedError, retry: retryRequest } = useRetainedRetryError({
    error: error ?? null,
    onRetry: retry,
  });
  if (displayedError && !hasData) {
    const uiError = normalizeAppUiError(displayedError, {
      area,
      surface: "route",
    });
    if (uiError.code === Code.NotFound) {
      return (
        notFoundState ?? <NotFoundState containerClassName="min-h-[60vh]" />
      );
    }
    return (
      <AppErrorView
        containerClassName="min-h-[60vh]"
        error={uiError}
        onRetry={retryRequest}
        retryLabel="Retry"
        variant="page"
      />
    );
  }
  if (loading && !hasData) {
    return (
      <BrandedLoadingState
        description="Fetching live metadata from the backend."
        title={title}
        variant="section"
      />
    );
  }
  if (!hasData) {
    return notFoundState ?? <NotFoundState containerClassName="min-h-[60vh]" />;
  }
  return children;
}
export function InstanceNotFoundState() {
  return (
    <div className="flex min-h-[60vh] items-center justify-center p-4">
      <div className="w-full max-w-lg">
        <EmptyState
          description="This instance is no longer available from the backend. Select another instance from the header to continue."
          icon={Database}
          title="Instance not found"
        />
      </div>
    </div>
  );
}
