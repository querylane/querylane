import { useEffect, useState } from "react";

function useDebouncedValue<T>(value: T, delayMs: number): T {
  const [debouncedValue, setDebouncedValue] = useState(value);
  useEffect(
    function updateDebouncedValue() {
      const timeoutId = globalThis.window.setTimeout(() => {
        setDebouncedValue(value);
      }, delayMs);
      return () => {
        globalThis.window.clearTimeout(timeoutId);
      };
    },
    [delayMs, value]
  );
  return debouncedValue;
}

export { useDebouncedValue };
