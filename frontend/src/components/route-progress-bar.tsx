import { useRouterState } from "@tanstack/react-router";
import { useDelayedFlag } from "@/hooks/use-delayed-flag";

const ROUTE_PROGRESS_DELAY_MS = 200;
const ROUTE_PROGRESS_MIN_DURATION_MS = 400;

export function RouteProgressBar() {
  const isLoading = useRouterState({
    select: (state) => state.isLoading,
  });
  const visible = useDelayedFlag(isLoading, {
    delayMs: ROUTE_PROGRESS_DELAY_MS,
    minDurationMs: ROUTE_PROGRESS_MIN_DURATION_MS,
  });

  return (
    <>
      {visible ? (
        <div
          aria-hidden="true"
          className="bg-primary/15 pointer-events-none absolute inset-x-0 top-0 z-50 h-0.5 overflow-hidden"
          data-testid="route-progress-bar"
        >
          <div className="route-progress-bar-fill bg-primary h-full w-1/3 rounded-full" />
        </div>
      ) : null}
      <output className="sr-only">{visible ? "Loading page" : ""}</output>
    </>
  );
}
