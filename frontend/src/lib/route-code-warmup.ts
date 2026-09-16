import type { AnyRoute, AnyRouter } from "@tanstack/react-router";

const MIN_IDLE_BUDGET_MS = 5;

interface RouteCodeWarmupOptions {
  canWarm: () => boolean;
  onError: (error: unknown) => void;
  router: Pick<AnyRouter, "loadRouteChunk">;
  routes: readonly AnyRoute[];
}

function allowsCodeWarmup() {
  const browserNavigator: Navigator & {
    connection?: { effectiveType?: string; saveData?: boolean };
  } = navigator;
  const { connection } = browserNavigator;
  return (
    navigator.onLine &&
    document.visibilityState === "visible" &&
    !connection?.saveData &&
    !["slow-2g", "2g", "3g"].includes(connection?.effectiveType ?? "")
  );
}

/** Load code only. Never use preloadRoute here: it executes data loaders. */
export function scheduleRouteCodeWarmup({
  canWarm,
  onError,
  router,
  routes,
}: RouteCodeWarmupOptions) {
  let cancelled = false;
  let idleId: number | undefined;
  let index = 0;

  function scheduleNext() {
    if (
      cancelled ||
      index >= routes.length ||
      !canWarm() ||
      !allowsCodeWarmup()
    ) {
      return;
    }
    idleId = window.requestIdleCallback(async (deadline) => {
      idleId = undefined;
      const route = routes[index];
      if (cancelled || !canWarm() || !allowsCodeWarmup() || !route) {
        return;
      }
      if (deadline.timeRemaining() < MIN_IDLE_BUDGET_MS) {
        scheduleNext();
        return;
      }
      index += 1;
      try {
        await router.loadRouteChunk(route, ["component"]);
        scheduleNext();
      } catch (error) {
        onError(error);
      }
    });
  }

  // No timeout/fallback: speculative downloads must never become startup work.
  if (typeof window.requestIdleCallback === "function") {
    if (document.readyState === "complete") {
      scheduleNext();
    } else {
      window.addEventListener("load", scheduleNext, { once: true });
    }
  }
  return () => {
    cancelled = true;
    window.removeEventListener("load", scheduleNext);
    if (idleId !== undefined) {
      window.cancelIdleCallback(idleId);
    }
  };
}
