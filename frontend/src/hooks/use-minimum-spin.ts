import { useEffect, useRef, useState } from "react";

const MIN_SPIN_DURATION_MS = 500;

/**
 * Extends a refresh-in-flight flag so it stays true for at least
 * MIN_SPIN_DURATION_MS after turning on. Fast responses would otherwise stop
 * the refresh spinner after a sub-perceptible flicker, leaving users unsure
 * whether the refresh happened. Unlike useDelayedFlag — which delays *showing*
 * to suppress flashes of short-lived loading states — this shows immediately
 * and holds.
 */
function useMinimumSpin(active: boolean): boolean {
  const [holding, setHolding] = useState(false);
  const activatedAtRef = useRef(0);

  // allow-useEffect: bridge the wall-clock minimum-spin window into state
  useEffect(
    function holdSpinForMinimumDuration() {
      if (active) {
        activatedAtRef.current = Date.now();
        setHolding(true);
        return;
      }

      const remaining =
        MIN_SPIN_DURATION_MS - (Date.now() - activatedAtRef.current);
      if (remaining <= 0) {
        setHolding(false);
        return;
      }

      const holdTimer = globalThis.setTimeout(() => {
        setHolding(false);
      }, remaining);
      return () => globalThis.clearTimeout(holdTimer);
    },
    [active]
  );

  return active || holding;
}

export { useMinimumSpin };
