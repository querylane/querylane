import { expect, rs, test } from "@rstest/core";
import { settleMetricResponses } from "../e2e/react-performance/settle-metric-response";

test("response headers with a held body cannot finish metric readiness", async () => {
  const body = Promise.withResolvers<Error | null>();
  const finished = rs.fn(() => body.promise);
  const rendered = rs.fn(() => Promise.resolve());
  const readiness = settleMetricResponses(
    [{ finished }, { finished: () => Promise.resolve(null) }],
    rendered
  );
  await Promise.resolve();
  expect(finished).toHaveBeenCalledTimes(1);
  expect(rendered).not.toHaveBeenCalled();
  body.resolve(null);
  await readiness;
  expect(rendered).toHaveBeenCalledTimes(1);
});

test("a failed response body rejects readiness without accepting a retained chart", async () => {
  const rendered = rs.fn(() => Promise.resolve());
  await expect(
    settleMetricResponses(
      [
        { finished: () => Promise.resolve(new Error("Body interrupted")) },
        { finished: () => Promise.resolve(null) },
      ],
      rendered
    )
  ).rejects.toThrow("Body interrupted");
  expect(rendered).not.toHaveBeenCalled();
});

test("a held previous-window response cannot escape the measurement after current data settles", async () => {
  const previous = Promise.withResolvers<Error | null>();
  const rendered = rs.fn(() => Promise.resolve());
  const readiness = settleMetricResponses(
    [
      { finished: () => Promise.resolve(null) },
      { finished: () => previous.promise },
    ],
    rendered
  );
  await Promise.resolve();
  expect(rendered).not.toHaveBeenCalled();
  previous.resolve(null);
  await readiness;
  expect(rendered).toHaveBeenCalledTimes(1);
});
