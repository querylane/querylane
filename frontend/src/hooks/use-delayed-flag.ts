import { useEffect, useRef, useState } from "react";

interface DelayedFlagOptions {
  delayMs?: number | undefined;
  minDurationMs?: number | undefined;
}

function useDelayedFlag(
  active: boolean,
  options: DelayedFlagOptions = {}
): boolean {
  const { delayMs = 200, minDurationMs = 400 } = options;
  const [visible, setVisible] = useState(false);
  const shownAtRef = useRef<number | undefined>(undefined);

  // allow-useEffect: sync visible state to an intentionally delayed flag
  useEffect(
    function syncDelayedFlagVisibility() {
      if (active) {
        if (visible) {
          return;
        }

        const showTimer = globalThis.setTimeout(() => {
          shownAtRef.current = Date.now();
          setVisible(true);
        }, delayMs);

        return () => globalThis.clearTimeout(showTimer);
      }

      if (!visible) {
        return;
      }

      const elapsed = Date.now() - (shownAtRef.current ?? Date.now());
      const remaining = minDurationMs - elapsed;

      if (remaining <= 0) {
        shownAtRef.current = undefined;
        setVisible(false);
        return;
      }

      const hideTimer = globalThis.setTimeout(() => {
        shownAtRef.current = undefined;
        setVisible(false);
      }, remaining);

      return () => globalThis.clearTimeout(hideTimer);
    },
    [active, delayMs, minDurationMs, visible]
  );

  return visible;
}

export type { DelayedFlagOptions };
export { useDelayedFlag };
