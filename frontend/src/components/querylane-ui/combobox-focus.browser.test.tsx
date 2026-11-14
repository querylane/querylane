import { page } from "@rstest/browser";
import { expect, test } from "@rstest/core";
import { useState } from "react";
import { render } from "@/__tests__/render-ui";
import {
  Combobox,
  ComboboxContent,
  ComboboxInput,
  ComboboxItem,
  ComboboxList,
  ComboboxTrigger,
} from "@/components/querylane-ui/combobox";
import { Input } from "@/components/ui/input";

function DatabasePicker() {
  const [database, setDatabase] = useState<string | null>("appdb");
  const [search, setSearch] = useState("");
  const [settled, setSettled] = useState("Pending");
  return (
    <>
      <Combobox
        onOpenChangeComplete={(open) => {
          setSettled(open ? "Open" : "Closed");
        }}
        onValueChange={setDatabase}
        value={database}
      >
        <ComboboxTrigger aria-label="Database">{database}</ComboboxTrigger>
        <ComboboxContent className="duration-200 motion-reduce:transition-opacity">
          <ComboboxInput aria-label="Search databases" />
          <ComboboxList>
            <ComboboxItem label="appdb" value="appdb">
              appdb
            </ComboboxItem>
            <ComboboxItem label="warehouse" value="warehouse">
              warehouse
            </ComboboxItem>
          </ComboboxList>
        </ComboboxContent>
      </Combobox>
      <Input
        aria-label="Search columns"
        onValueChange={setSearch}
        value={search}
      />
      <output aria-label="Picker lifecycle">{settled}</output>
      <output aria-label="Column filter">{search}</output>
    </>
  );
}

test("outside dismissal leaves focus and subsequent typing in the chosen field", async () => {
  await render(<DatabasePicker />);
  await page.getByRole("button", { name: "Database", exact: true }).click();
  await expect
    .element(page.getByRole("combobox", { name: "Search databases" }))
    .toBeFocused();
  await expect
    .element(page.getByRole("status", { name: "Picker lifecycle" }))
    .toHaveText("Open");
  const columns = page.getByRole("textbox", { name: "Search columns" });
  await columns.click();
  await expect.element(page.getByRole("listbox")).toBeDetached();
  await expect
    .element(page.getByRole("status", { name: "Picker lifecycle" }))
    .toHaveText("Closed");
  await expect.element(columns).toBeFocused();
  await columns.pressSequentially("customer");
  await expect
    .element(page.getByRole("status", { name: "Column filter" }))
    .toHaveText("customer");
});

test("escape and selection still restore the database trigger", async () => {
  await render(<DatabasePicker />);
  const trigger = page.getByRole("button", { name: "Database", exact: true });
  // The SDK may restore a previously focused outside control; Escape and
  // selection still belong to this input-in-popup trigger.
  await page.getByRole("textbox", { name: "Search columns" }).click();
  await trigger.click();
  await page
    .getByRole("combobox", { name: "Search databases" })
    .press("Escape");
  await expect.element(page.getByRole("listbox")).toBeDetached();
  await expect.element(trigger).toBeFocused();
  await trigger.click();
  await page
    .getByRole("combobox", { name: "Search databases" })
    .fill("warehouse");
  await page.getByRole("combobox", { name: "Search databases" }).press("Enter");
  await expect.element(page.getByRole("listbox")).toBeDetached();
  await expect.element(trigger).toHaveText("warehouse");
  await expect.element(trigger).toBeFocused();
});

test("focus-out dismissal preserves a programmatically focused field", async () => {
  await render(<DatabasePicker />);
  await page.getByRole("button", { name: "Database", exact: true }).click();
  await expect
    .element(page.getByRole("status", { name: "Picker lifecycle" }))
    .toHaveText("Open");
  const columns = page.getByRole("textbox", { name: "Search columns" });
  await columns.focus();
  await expect
    .element(page.getByRole("status", { name: "Picker lifecycle" }))
    .toHaveText("Closed");
  await expect.element(columns).toBeFocused();
  await columns.pressSequentially("account");
  await expect
    .element(page.getByRole("status", { name: "Column filter" }))
    .toHaveText("account");
});
