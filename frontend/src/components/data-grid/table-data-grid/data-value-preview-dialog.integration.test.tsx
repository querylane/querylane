import { expect, rs, test } from "@rstest/core";
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { DataValuePreviewDialog } from "./data-value-preview-dialog";

const RAW_JSON = '{"ok":true}';
const truncatedMessage = /This cell preview is truncated/;

test("preserves truncated JSON content, copy action, and dialog dismissal", async () => {
  const user = userEvent.setup();
  const onOpenChange = rs.fn();
  render(
    <DataValuePreviewDialog
      columnName="metadata"
      format="JSON"
      isTruncated={true}
      onOpenChange={onOpenChange}
      raw={RAW_JSON}
      rawType="jsonb"
    >
      {'{\n  "ok": true\n}'}
    </DataValuePreviewDialog>
  );
  expect(screen.getByRole("dialog").textContent).toContain("metadata JSON");
  expect(screen.getByText(truncatedMessage)).toBeTruthy();
  await user.click(screen.getByRole("button", { name: "Copy JSON" }));
  expect(await navigator.clipboard.readText()).toBe(RAW_JSON);
  await user.click(screen.getByRole("button", { name: "Close" }));
  expect(onOpenChange).toHaveBeenCalledWith(false, expect.anything());
});
