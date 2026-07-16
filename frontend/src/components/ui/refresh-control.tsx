import { RefreshCw } from "lucide-react";
import { Button } from "@/components/ui/button";
import { useMinimumSpin } from "@/hooks/use-minimum-spin";
import { cn } from "@/lib/utils";

interface RefreshControlProps {
  ariaLabel?: string;
  className?: string | undefined;
  isRefreshing?: boolean | undefined;
  labelClassName?: string | undefined;
  lastFetchedLabel: string;
  onRefresh: () => Promise<unknown> | undefined;
}

/**
 * Shared "Last fetched … + refresh" control used by both the data grid toolbar
 * and the metadata-tab data tables, so the two parallel explorer surfaces keep
 * identical spin/aria-live/disabled behavior from a single source.
 */
function RefreshControl({
  ariaLabel = "Refresh",
  className,
  isRefreshing = false,
  labelClassName,
  lastFetchedLabel,
  onRefresh,
}: RefreshControlProps) {
  // disabled tracks the real in-flight state; the spin visual is held for a
  // minimum duration so fast refreshes are still visibly acknowledged.
  const isSpinning = useMinimumSpin(isRefreshing);
  return (
    <span className={cn("flex shrink-0 items-center gap-1", className)}>
      {/* Default sr-only keeps the polite live region in the a11y tree so the
          refresh result is announced; callers reveal it visually at their own
          breakpoint via labelClassName (e.g. "sm:not-sr-only"). A display:none
          (`hidden`) live region would never be announced. */}
      <span
        aria-live="polite"
        className={cn("sr-only max-w-48 truncate", labelClassName)}
      >
        {lastFetchedLabel}
      </span>
      <Button
        aria-label={ariaLabel}
        disabled={isRefreshing}
        onClick={() => {
          // Failures are surfaced via the caller-controlled isRefreshing state;
          // swallow the rejection here so it isn't an unhandled promise.
          onRefresh()?.catch(() => undefined);
        }}
        size="icon-xs"
        type="button"
        variant="ghost"
      >
        <RefreshCw
          aria-hidden="true"
          className={cn(
            "size-3.5",
            isSpinning && "animate-spin motion-reduce:animate-none"
          )}
        />
      </Button>
    </span>
  );
}

export { RefreshControl };
