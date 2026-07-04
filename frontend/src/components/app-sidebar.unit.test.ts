import { expect, test } from "vitest";

test("global settings dialog files stay deleted", () => {
  const globalSettingsFiles = import.meta.glob([
    "./app-settings-dialog.tsx",
    "./data-refresh-settings-fields.tsx",
  ]);

  expect(Object.keys(globalSettingsFiles)).toHaveLength(0);
});
