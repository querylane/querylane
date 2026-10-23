import { afterEach, expect, rs, test } from "@rstest/core";
import { act, cleanup, renderHook } from "@testing-library/react";
import { useMinimumSpin } from "./use-minimum-spin";

afterEach(() => {
  cleanup();
  rs.useRealTimers();
});

test("holds fast refreshes for the minimum, but does not prolong a completed long refresh", async () => {
  rs.useFakeTimers();
  const { result, rerender } = renderHook(
    ({ active }) => useMinimumSpin(active),
    { initialProps: { active: false } }
  );
  expect(result.current).toBe(false);
  rerender({ active: true });
  expect(result.current).toBe(true);
  await act(async () => {
    await rs.advanceTimersByTimeAsync(100);
  });
  rerender({ active: false });
  expect(result.current).toBe(true);
  await act(async () => {
    await rs.advanceTimersByTimeAsync(399);
  });
  expect(result.current).toBe(true);
  await act(async () => {
    await rs.advanceTimersByTimeAsync(1);
  });
  expect(result.current).toBe(false);
  rerender({ active: true });
  await act(async () => {
    await rs.advanceTimersByTimeAsync(600);
  });
  rerender({ active: false });
  expect(result.current).toBe(false);
});
