import { page } from "@rstest/browser";
import { render } from "@rstest/browser-react";
import { expect, test } from "@rstest/core";
import { getByRole } from "@testing-library/dom";
import { Drawer, DrawerContent, DrawerTitle } from "./drawer";

test.each(["left", "right"] as const)(
  "%s drawer preserves swipe styles and reduced motion",
  async (swipeDirection) => {
    await render(
      <Drawer defaultOpen={true} swipeDirection={swipeDirection}>
        <DrawerContent>
          <DrawerTitle>Navigation</DrawerTitle>
        </DrawerContent>
      </Drawer>
    );
    await expect
      .element(page.getByRole("dialog", { name: "Navigation" }))
      .toBeVisible();
    const popup = getByRole(document.body, "dialog", { name: "Navigation" });
    const backdrop = document.querySelector<HTMLElement>(
      '[data-slot="drawer-overlay"]'
    );
    if (!backdrop) {
      throw new Error("Drawer backdrop is missing");
    }

    // Exercise Base UI's styling contract at deterministic swipe positions.
    backdrop.style.setProperty("--drawer-swipe-progress", "0.25");
    expect(getComputedStyle(backdrop).opacity).toBe("0.75");
    backdrop.setAttribute("data-starting-style", "");
    expect(getComputedStyle(backdrop).opacity).toBe("0");
    backdrop.removeAttribute("data-starting-style");

    for (const element of [backdrop, popup]) {
      element.style.setProperty("--drawer-swipe-strength", "0.5");
      element.setAttribute("data-ending-style", "");
      expect(getComputedStyle(element).transitionDuration).toBe("0.1s");
      expect(getComputedStyle(element).transitionProperty).toBe("none");
    }
    expect(getComputedStyle(backdrop).opacity).toBe("0");
  }
);
