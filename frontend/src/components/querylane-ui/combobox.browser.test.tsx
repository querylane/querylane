import { page } from "@rstest/browser";
import { render } from "@rstest/browser-react";
import { expect, rs, test } from "@rstest/core";
import { getByRole } from "@testing-library/dom";
import {
  Combobox,
  ComboboxContent,
  ComboboxEmpty,
  ComboboxInput,
  ComboboxItem,
  ComboboxList,
  ComboboxTrigger,
} from "@/components/querylane-ui/combobox";
import { createComboboxItems } from "@/components/querylane-ui/combobox-items";
import { BrowserSurface } from "@/test/browser-surface.test-utils";

interface DatabaseOption {
  id: string;
  name: string;
}

function AsyncDatabasePicker({
  options,
  onValueChange,
}: {
  options: readonly DatabaseOption[];
  onValueChange: (id: string | null) => void;
}) {
  const items = createComboboxItems(options, {
    getLabel: (database) => database.name,
    getValue: (database) => database.id,
  });
  return (
    <BrowserSurface>
      <Combobox
        autoHighlight={true}
        items={items}
        onValueChange={onValueChange}
      >
        <ComboboxTrigger aria-label="Pick database">
          Pick database
        </ComboboxTrigger>
        <ComboboxContent>
          <ComboboxInput aria-label="Search databases" />
          <ComboboxEmpty>No databases found</ComboboxEmpty>
          <ComboboxList>
            {(database: DatabaseOption) => (
              <ComboboxItem key={database.id} value={database.id}>
                {database.name}
              </ComboboxItem>
            )}
          </ComboboxList>
        </ComboboxContent>
      </Combobox>
    </BrowserSurface>
  );
}

test("async results highlight after typing and duplicate labels retain distinct values", async () => {
  const onValueChange = rs.fn();
  const { rerender } = await render(
    <AsyncDatabasePicker onValueChange={onValueChange} options={[]} />
  );
  await page.getByRole("combobox", { name: "Pick database" }).click();
  const input = page.getByRole("combobox", { name: "Search databases" });
  await input.fill("reports");
  await expect.element(page.getByText("No databases found")).toBeVisible();
  await rerender(
    <AsyncDatabasePicker
      onValueChange={onValueChange}
      options={[
        { id: "primary", name: "reports" },
        { id: "replica", name: "reports" },
      ]}
    />
  );
  const options = page.getByRole("option", { name: "reports", exact: true });
  await expect.element(options.nth(0)).toHaveAttribute("data-highlighted", "");

  expect(
    getByRole(document.body, "status").getBoundingClientRect().height
  ).toBe(0);
  await input.press("ArrowDown");
  await expect.element(options.nth(1)).toHaveAttribute("data-highlighted", "");
  await input.press("Enter");
  expect(onValueChange).toHaveBeenCalledExactlyOnceWith(
    "replica",
    expect.anything()
  );
  await expect.element(page.getByRole("listbox")).toBeDetached();
  await expect
    .element(page.getByRole("combobox", { name: "Pick database" }))
    .toBeFocused();
});
