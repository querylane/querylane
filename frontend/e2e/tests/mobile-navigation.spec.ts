import { openAdminShell } from "../visual/console-resource-fixtures";
import { expect, test } from "./base";

test.use({ hasTouch: true });

test("mobile navigation dismisses by swiping and restores keyboard focus", async ({
  page,
  context,
  makeAxeBuilder,
}) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await openAdminShell(page);
  const trigger = page.getByRole("button", { name: "Open navigation menu" });
  await trigger.click();
  const drawer = page.getByRole("dialog", { name: "Sidebar" });
  await expect(drawer).toBeVisible();
  const bounds = await drawer.boundingBox();
  if (!bounds) {
    throw new Error("Expected mobile navigation drawer bounds");
  }
  const awaitedResult1 = await makeAxeBuilder().analyze();
  expect(awaitedResult1.violations).toEqual([]);

  await test.step("swipe the navigation header closed", async () => {
    await page.mouse.move(bounds.x + bounds.width - 30, bounds.y + 12);
    await page.mouse.down();
    await page.mouse.move(bounds.x + 10, bounds.y + 12, { steps: 8 });
    await page.mouse.up();
    await expect(drawer).toBeHidden();
  });

  await test.step("reopen and dismiss from the keyboard", async () => {
    await trigger.click();
    await expect(drawer).toBeVisible();
    await page.keyboard.press("Escape");
    await expect(drawer).toBeHidden();
    await expect(trigger).toBeFocused();
  });

  await test.step("dismiss with a touch swipe followed by a stationary sample", async () => {
    await trigger.click();
    await expect(drawer).toBeVisible();
    const session = await context.newCDPSession(page);
    const timestamp = Date.now() / 1000;
    try {
      await session.send("Input.dispatchTouchEvent", {
        type: "touchStart",
        touchPoints: [{ x: 258, y: 12 }],
        timestamp,
      });
      // Gesture samples must reach Chromium in order, not in parallel.
      await [230, 180, 130, 80, 20, 20].reduce<Promise<void>>(
        async (previous, x, index) => {
          await previous;
          await session.send("Input.dispatchTouchEvent", {
            type: "touchMove",
            touchPoints: [{ x, y: 12 }],
            timestamp: timestamp + (index + 1) / 120,
          });
        },
        Promise.resolve()
      );
      await session.send("Input.dispatchTouchEvent", {
        type: "touchEnd",
        touchPoints: [],
        timestamp: timestamp + 7 / 120,
      });
      await expect(drawer).toBeHidden();
    } finally {
      await session.detach();
    }
  });
});
