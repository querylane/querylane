import { afterEach, expect, rs, test } from "@rstest/core";
import { act, renderHook } from "@testing-library/react";
import { useDebouncedValue } from "@/hooks/use-debounced-value";
import { actSynchronous } from "@/test/async-act";

afterEach(() => {
  rs.useRealTimers();
});

test("publishes the latest value only after the quiet period", async () => {
  rs.useFakeTimers();
  const { rerender, result } = renderHook(
    ({ value }) => useDebouncedValue(value, 200),
    { initialProps: { value: "a" } }
  );

  rerender({ value: "ab" });
  expect(result.current).toBe("a");

  await actSynchronous(act, () => {
    rs.advanceTimersByTime(199);
  });
  expect(result.current).toBe("a");

  await actSynchronous(act, () => {
    rs.advanceTimersByTime(1);
  });
  expect(result.current).toBe("ab");
});
