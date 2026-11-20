import { page } from "@rstest/browser";
import { render } from "@rstest/browser-react";
import { afterEach, expect, rs, test } from "@rstest/core";
import { SqlEditor } from "@/features/sql-workbench/sql-editor";

afterEach(() => {
  rs.useRealTimers();
});

test.each([
  { selectionKeys: "", table: "orders" },
  { selectionKeys: "ArrowDown", table: "orders_archive" },
])(
  "tab completes the highlighted table $table without indenting SQL",
  async ({ selectionKeys, table }) => {
    rs.useFakeTimers({ now: 0, toFake: ["Date"] });
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

    // Model the pinned CodeMirror 6.20.4 interaction guard with a clock
    // installed before mounting. Timer/event APIs stay real; no wall-time wait.
    rs.advanceTimersByTime(75);
    if (selectionKeys) {
      await page.keyboard.press(selectionKeys);
    }
    await expect
      .element(page.getByRole("option", { name: table, exact: true }))
      .toHaveAttribute("aria-selected", "true");
    await page.keyboard.press("Tab");

    await expect.element(editor).toHaveText(`SELECT * FROM ${table}`);
    expect(onChange).toHaveBeenLastCalledWith(`SELECT * FROM ${table}`);
    await expect.element(page.getByRole("listbox")).toBeDetached();
    await expect.element(editor).toBeFocused();
  }
);

test("tab and Shift+Tab still indent when no completion is open", async () => {
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

  const keydown = rs.fn<(event: KeyboardEvent) => void>();
  document.addEventListener("keydown", keydown, { once: true });
  await page.keyboard.press("Tab");
  expect(keydown).toHaveBeenCalledWith(
    expect.objectContaining({ isTrusted: true })
  );
  await rs.waitFor(() => {
    expect(onChange).toHaveBeenLastCalledWith("  SELECT 1;");
  });
  await page.keyboard.press("Shift+Tab");
  await rs.waitFor(() => {
    expect(onChange).toHaveBeenLastCalledWith("SELECT 1;");
  });
});
