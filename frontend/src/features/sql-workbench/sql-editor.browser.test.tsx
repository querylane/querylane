import { page } from "@rstest/browser";
import { render } from "@rstest/browser-react";
import { expect, rs, test } from "@rstest/core";
import userEvent from "@testing-library/user-event";
import { SqlEditor } from "@/features/sql-workbench/sql-editor";

test.each([
  { selectionKeys: "", table: "orders" },
  { selectionKeys: "{ArrowDown}", table: "orders_archive" },
])(
  "Tab completes the highlighted table $table without indenting SQL",
  async ({ selectionKeys, table }) => {
    const user = userEvent.setup();
    const onChange = rs.fn();
    await render(
      <SqlEditor
        ariaLabel="SQL editor"
        onChange={onChange}
        onFormat={rs.fn()}
        onRunAll={rs.fn()}
        onRunCurrent={rs.fn()}
        schema={{ public: { orders: ["id"], orders_archive: ["id"] } }}
        value=""
      />
    );
    const editor = page.getByRole("textbox", { name: "SQL editor" });
    await editor.fill("SELECT * FROM ord");
    await expect
      .element(page.getByRole("option", { name: "orders", exact: true }))
      .toHaveAttribute("aria-selected", "true");

    // Skip CodeMirror's brief accidental-keypress guard without a timed wait.
    rs.spyOn(Date, "now").mockReturnValue(Date.now() + 1000);
    if (selectionKeys) {
      await user.keyboard(selectionKeys);
    }
    await expect
      .element(page.getByRole("option", { name: table, exact: true }))
      .toHaveAttribute("aria-selected", "true");
    await user.keyboard("{Tab}");

    await expect.element(editor).toHaveText(`SELECT * FROM ${table}`);
    expect(onChange).toHaveBeenLastCalledWith(`SELECT * FROM ${table}`);
    await expect.element(page.getByRole("listbox")).toBeDetached();
    await expect.element(editor).toBeFocused();
  }
);

test("Tab and Shift+Tab still indent when no completion is open", async () => {
  const user = userEvent.setup();
  const onChange = rs.fn();
  await render(
    <SqlEditor
      ariaLabel="SQL editor"
      onChange={onChange}
      onFormat={rs.fn()}
      onRunAll={rs.fn()}
      onRunCurrent={rs.fn()}
      schema={{}}
      value=""
    />
  );
  const editor = page.getByRole("textbox", { name: "SQL editor" });
  await editor.fill("SELECT 1;");
  await expect.element(page.getByRole("listbox")).toBeDetached();

  await user.keyboard("{Tab}");
  expect(onChange).toHaveBeenLastCalledWith("  SELECT 1;");
  await user.keyboard("{Shift>}{Tab}{/Shift}");
  expect(onChange).toHaveBeenLastCalledWith("SELECT 1;");
});
