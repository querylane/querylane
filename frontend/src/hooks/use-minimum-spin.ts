import { useEffect, useState } from "react";

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
  const [cycle, setCycle] = useState({
    active,
    holding: active,
    sequence: active ? 1 : 0,
  });
  if (cycle.active !== active) {
    setCycle({
      active,
      holding: active || cycle.holding,
      sequence: cycle.sequence + Number(active),
    });
  }
  const { sequence } = cycle;
  useEffect(
    function expireMinimumSpin() {
      if (sequence === 0) {
        return;
      }
      const timer = globalThis.setTimeout(() => {
        setCycle((current) => ({ ...current, holding: false }));
      }, MIN_SPIN_DURATION_MS);
      return () => {
        globalThis.clearTimeout(timer);
      };
    },
    [sequence]
  );
  return active || cycle.holding;
}

export { useMinimumSpin };
