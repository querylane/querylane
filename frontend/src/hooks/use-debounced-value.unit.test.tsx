import { act, renderHook } from "@testing-library/react";
import { afterEach, expect, test, vi } from "vitest";
import { useDebouncedValue } from "@/hooks/use-debounced-value";

afterEach(() => {
  vi.useRealTimers();
});

test("publishes the latest value only after the quiet period", () => {
  vi.useFakeTimers();
  const { rerender, result } = renderHook(
    ({ value }) => useDebouncedValue(value, 200),
    { initialProps: { value: "a" } }
  );

  rerender({ value: "ab" });
  expect(result.current).toBe("a");

  act(() => vi.advanceTimersByTime(199));
  expect(result.current).toBe("a");

  act(() => vi.advanceTimersByTime(1));
  expect(result.current).toBe("ab");
});
