import { page } from "@rstest/browser";
import { render } from "@rstest/browser-react";
import { expect, rs, test } from "@rstest/core";
import { getByRole } from "@testing-library/dom";
import { DataGridCheckbox } from "@/components/data-grid/table-data-grid/data-grid-checkbox";

test("renders the select-all indeterminate state without a tooltip layer", async () => {
  await render(
    <DataGridCheckbox
      aria-label="Select All"
      checked={false}
      disabled={false}
      indeterminate={true}
      onChange={rs.fn()}
      tabIndex={0}
    />
  );

  const checkbox = page.getByRole("checkbox", { name: "Select All" });
  await expect.element(checkbox).toBeVisible();
  const checkboxElement = getByRole(document.body, "checkbox", {
    name: "Select All",
  });
  expect(checkboxElement.classList).toContain("rdg-checkbox-input");
  expect((checkboxElement as HTMLInputElement).indeterminate).toBe(true);
  await expect.element(checkbox).toHaveAttribute("title", "Clear selection");
  await expect.element(page.getByRole("tooltip")).toBeDetached();
});

test("forwards Shift selection through the native checkbox", async () => {
  const onChange = rs.fn();
  await render(
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
  await checkbox.dispatchEvent("click", { bubbles: true, shiftKey: true });

  expect(onChange).toHaveBeenCalledWith(true, true);
});
