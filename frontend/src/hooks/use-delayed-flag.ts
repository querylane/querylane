import { useEffect, useRef, useState } from "react";

interface DelayedFlagOptions {
  delayMs?: number | undefined;
  minDurationMs?: number | undefined;
}

function useDelayedFlag(active: boolean, options: DelayedFlagOptions = {}) {
  const { delayMs = 200, minDurationMs = 400 } = options;
  const [visible, setVisible] = useState(false);
  const shownAtRef = useRef<number | undefined>(undefined);

  useEffect(
    function syncDelayedFlagVisibility() {
      if (active) {
        if (visible) {
          return undefined;
        }

        const showTimer = globalThis.setTimeout(() => {
          shownAtRef.current = Date.now();
          setVisible(true);
        }, delayMs);

        return (() => {
          globalThis.clearTimeout(showTimer);
        }) satisfies (() => void) | undefined;
      }

      if (!visible) {
        return undefined;
      }

      const elapsed = Date.now() - (shownAtRef.current ?? Date.now());
      const remaining = minDurationMs - elapsed;

      if (remaining <= 0) {
        shownAtRef.current = undefined;
        setVisible(false);
        return undefined;
      }

      const hideTimer = globalThis.setTimeout(() => {
        shownAtRef.current = undefined;
        setVisible(false);
      }, remaining);

      return (() => {
        globalThis.clearTimeout(hideTimer);
      }) satisfies (() => void) | undefined;
    },
    [active, delayMs, minDurationMs, visible]
  );

  return visible;
}

export type { DelayedFlagOptions };
export { useDelayedFlag };
