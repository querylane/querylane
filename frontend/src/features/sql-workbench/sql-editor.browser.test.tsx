import { page } from "@rstest/browser";
import { render } from "@rstest/browser-react";
import { expect, rs, test } from "@rstest/core";
import userEvent from "@testing-library/user-event";
import { SqlEditor } from "@/features/sql-workbench/sql-editor";

test("tab and Shift+Tab still indent when no completion is open", async () => {
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
