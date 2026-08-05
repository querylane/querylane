import { useEffect, useState } from "react";

function useDebouncedValue<T>(value: T, delayMs: number): T {
  const [debouncedValue, setDebouncedValue] = useState(value);
  useEffect(
    function updateDebouncedValue() {
      const timeoutId = window.setTimeout(() => {
        setDebouncedValue(value);
      }, delayMs);
      return () => window.clearTimeout(timeoutId);
    },
    [delayMs, value]
  );
  return debouncedValue;
}

export { useDebouncedValue };
