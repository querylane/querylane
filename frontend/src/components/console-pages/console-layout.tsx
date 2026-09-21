"use client";

import { Code } from "@connectrpc/connect";
import { Database, Info } from "lucide-react";
import { AppErrorView } from "@/components/app-error-view";
import { BrandedLoadingState } from "@/components/branded-loading-state";
import { EmptyState } from "@/components/empty-state";
import { NotFoundState } from "@/components/not-found-state";
import {
  Card,
  CardContent,
  CardHeader,
  CardTitle,
} from "@/components/querylane-ui/card";
import { OverflowTooltip } from "@/components/querylane-ui/overflow-tooltip";
import { Progress } from "@/components/querylane-ui/progress";
import { CopyIconButton } from "@/components/ui/copy-icon-button";
import { Spinner } from "@/components/ui/spinner";
import {
  Tooltip,
  TooltipContent,
  TooltipTrigger,
} from "@/components/ui/tooltip";
import { useRetainedRetryError } from "@/components/use-retained-retry-error";
import { normalizeAppUiError } from "@/lib/ui-error";
import { cn } from "@/lib/utils";

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
    <Card className="h-16" presentation="bordered" size="sm">
      <CardContent
        className="flex h-full flex-col justify-center"
        presentation="metric"
      >
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
export function InstanceStatsBar({
  children,
  className,
}: {
  children: React.ReactNode;
  className?: string | undefined;
}) {
  return (
    <div
      className={cn(
        "grid grid-cols-2 divide-x divide-border overflow-hidden rounded-lg border border-border lg:grid-cols-4",
        className
      )}
    >
      {children}
    </div>
  );
}
export function InstanceStatItem({
  children,
  hint,
  label,
  notice,
  progress,
  suffix,
  renderTrend,
}: {
  children: React.ReactNode;
  /** Optional plain-language explanation shown in a tooltip on the label. */
  hint?: string | undefined;
  label: string;
  notice?: React.ReactNode | undefined;
  progress?: number | undefined;
  suffix?: string | undefined;
  /** Renders an optional trend glyph (for example, a sparkline) right-aligned to the value. */
  renderTrend?: (() => React.ReactNode) | undefined;
}) {
  return (
    <div className="relative flex min-h-24 flex-col px-4 pt-3.5 pb-8">
      {renderTrend ? (
        <div
          aria-hidden="true"
          className="pointer-events-none absolute inset-x-4 bottom-0 h-7 opacity-45 empty:hidden"
        >
          {renderTrend()}
        </div>
      ) : null}
      <div className="relative flex flex-col gap-1">
        {hint ? (
          <Tooltip>
            <TooltipTrigger
              render={
                <span className="flex w-fit cursor-help items-center gap-1 text-muted-foreground text-xs">
                  {label}
                  <Info aria-hidden="true" className="size-3 opacity-60" />
                </span>
              }
            />
            <TooltipContent className="max-w-xs">{hint}</TooltipContent>
          </Tooltip>
        ) : (
          <span className="text-muted-foreground text-xs">{label}</span>
        )}
        <div className="flex min-h-7 items-baseline gap-1.5">
          {children}
          {suffix ? (
            <span className="font-mono text-muted-foreground text-xs tabular-nums">
              {suffix}
            </span>
          ) : null}
        </div>
        {progress === undefined ? null : (
          <Progress density="compact" value={progress} />
        )}
        {notice ? (
          <div className="text-warning-600 text-xs leading-snug dark:text-warning-400">
            {notice}
          </div>
        ) : null}
      </div>
    </div>
  );
}
export function CopyableHost({ host, port }: { host: string; port?: number }) {
  const fullHost = port ? `${host}:${port}` : host;
  return (
    <span className="inline-flex min-w-0 max-w-full items-center gap-1">
      <OverflowTooltip
        className="min-w-0 max-w-[min(18rem,calc(100vw-6rem))]"
        forceTooltip={true}
        presentation="metric"
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
      <p className="text-muted-foreground text-xs uppercase tracking-brand">
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
    <Card presentation="bordered">
      <CardHeader
        className="flex flex-col items-start justify-between sm:flex-row"
        presentation="section"
      >
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
    <Card presentation="bordered" size="sm">
      <CardHeader presentation="inset">
        <CardTitle>{title}</CardTitle>
      </CardHeader>
      <CardContent presentation="inset">
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
