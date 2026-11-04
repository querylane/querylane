import { page } from "@rstest/browser";
import { cleanup, render } from "@rstest/browser-react";
import { afterEach, expect, test } from "@rstest/core";
import { Button } from "@/components/ui/button";
import { SqlCodeBlock } from "./sql-code-block";

afterEach(cleanup);

const SQL =
  "ALTER TABLE public.orders ADD CONSTRAINT orders_customer_id_fkey FOREIGN KEY (customer_id) REFERENCES public.customers(id);";

test("SQL scroll focus follows real overflow after container and source changes", async () => {
  function snippet(wide: boolean, sql: string) {
    return (
      <div className={wide ? "w-[1200px]" : "w-64"}>
        <Button>Before snippet</Button>
        <SqlCodeBlock sql={sql} />
      </div>
    );
  }
  const view = await render(snippet(false, SQL));
  const pre = document.querySelector("pre");
  if (!pre) {
    throw new Error("Expected the SQL scroll owner.");
  }
  await expect.poll(() => pre.tabIndex).toBe(0);
  await page.getByRole("button", { name: "Before snippet" }).click();
  await page.keyboard.press("Tab");
  expect(document.activeElement).toBe(pre);
  expect(getComputedStyle(pre).outlineStyle).toBe("solid");
  expect(getComputedStyle(pre).outlineWidth).toBe("2px");
  await page.keyboard.press("ArrowRight");
  await expect.poll(() => pre.scrollLeft).toBeGreaterThan(0);

  async function expectCopyNext(element: HTMLPreElement) {
    await expect.poll(() => element.tabIndex).toBe(-1);
    await page.getByRole("button", { name: "Before snippet" }).click();
    await page.keyboard.press("Tab");
    await expect
      .element(page.getByRole("button", { name: "Copy SQL" }))
      .toBeFocused();
  }
  await view.rerender(snippet(true, SQL));
  await expectCopyNext(pre);
  await view.rerender(snippet(false, "SELECT 1;"));
  await expectCopyNext(pre);
  await view.rerender(snippet(false, SQL));
  await expect.poll(() => pre.tabIndex).toBe(0);
});

test.each([
  { variant: "block", wrap: true },
  { variant: "compact", wrap: false },
  { variant: "inline", wrap: false },
] as const)(
  "$variant wrap=$wrap does not add a dead tab stop",
  async (props) => {
    await render(
      <div className="w-64">
        <Button>Before snippet</Button>
        <SqlCodeBlock sql={SQL} {...props} />
      </div>
    );
    await page.getByRole("button", { name: "Before snippet" }).click();
    await page.keyboard.press("Tab");
    await expect
      .element(page.getByRole("button", { name: "Copy SQL" }))
      .toBeFocused();
  }
);
