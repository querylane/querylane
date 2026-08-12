import { afterEach, expect, rs, test } from "@rstest/core";
import { act, renderHook } from "@testing-library/react";
import { useDebouncedValue } from "@/hooks/use-debounced-value";

afterEach(() => {
  rs.useRealTimers();
});

test("publishes the latest value only after the quiet period", () => {
  rs.useFakeTimers();
  const { rerender, result } = renderHook(
    ({ value }) => useDebouncedValue(value, 200),
    { initialProps: { value: "a" } }
  );

  rerender({ value: "ab" });
  expect(result.current).toBe("a");

  act(() => rs.advanceTimersByTime(199));
  expect(result.current).toBe("a");

  act(() => rs.advanceTimersByTime(1));
  expect(result.current).toBe("ab");
});
