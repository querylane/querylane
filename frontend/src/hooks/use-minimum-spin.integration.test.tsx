import { act, cleanup, render } from "@testing-library/react";
import { afterEach, expect, test } from "vitest";

import { useMinimumSpin } from "@/hooks/use-minimum-spin";

afterEach(() => {
  cleanup();
});

function Probe({ active }: { active: boolean }) {
  const spin = useMinimumSpin(active);
  return <div data-spin={String(spin)} data-testid="probe" />;
}

const sleep = (ms: number) =>
  act(() => new Promise<void>((resolve) => setTimeout(resolve, ms)));

test("holds the spin for at least the minimum duration after a fast response", async () => {
  const { getByTestId, rerender } = render(<Probe active={false} />);

  rerender(<Probe active={true} />);
  await sleep(50);
  rerender(<Probe active={false} />);

  await sleep(100);
  expect(getByTestId("probe").dataset["spin"]).toBe("true");

  await sleep(600);
  expect(getByTestId("probe").dataset["spin"]).toBe("false");
});

test("stops immediately when the fetch outlasts the minimum window", async () => {
  const { getByTestId, rerender } = render(<Probe active={false} />);

  rerender(<Probe active={true} />);
  await sleep(600);
  rerender(<Probe active={false} />);
  await sleep(50);

  expect(getByTestId("probe").dataset["spin"]).toBe("false");
});
