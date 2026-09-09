import config from "../playwright.config";
import { expect, test } from "./base";

test("harness: reduced motion and actionable failure traces stay enabled", async ({
  page,
}) => {
  expect(config.retries).toBe(0);
  expect(config.use?.trace).toEqual({
    mode: "retain-on-failure",
    snapshots: { aria: true, dom: true, screen: true },
  });
  expect(config.use?.reducedMotion).toBe("reduce");
  expect(
    await page.evaluate(
      () => matchMedia("(prefers-reduced-motion: reduce)").matches
    )
  ).toBe(true);
});
