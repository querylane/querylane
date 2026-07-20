import { afterEach, expect, test, vi } from "vitest";
import { page } from "vitest/browser";
import { cleanup, render } from "vitest-browser-react";
import { DataGridCheckbox } from "@/components/data-grid/table-data-grid/data-grid-checkbox";

afterEach(cleanup);

test("renders the select-all indeterminate state without a tooltip layer", async () => {
  render(
    <DataGridCheckbox
      aria-label="Select All"
      checked={false}
      disabled={false}
      indeterminate={true}
      onChange={vi.fn()}
      tabIndex={0}
    />
  );

  const checkbox = page.getByRole("checkbox", { name: "Select All" });
  await expect.element(checkbox).toBeVisible();
  expect(checkbox.element().classList).toContain("rdg-checkbox-input");
  expect((checkbox.element() as HTMLInputElement).indeterminate).toBe(true);
  await expect.element(checkbox).toHaveAttribute("title", "Clear selection");
  await expect.element(page.getByRole("tooltip")).not.toBeInTheDocument();
});

test("forwards Shift selection through the native checkbox", async () => {
  const onChange = vi.fn();
  render(
    <DataGridCheckbox
      aria-label="Select"
      checked={false}
      disabled={false}
      indeterminate={false}
      onChange={onChange}
      tabIndex={0}
    />
  );

  const checkbox = page.getByRole("checkbox", { name: "Select" });
  await expect.element(checkbox).toBeVisible();
  checkbox
    .element()
    .dispatchEvent(new MouseEvent("click", { bubbles: true, shiftKey: true }));

  expect(onChange).toHaveBeenCalledWith(true, true);
});
