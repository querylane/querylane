import { fireEvent, render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, expect, test, vi } from "vitest";
import { KeyboardShortcutsProvider } from "@/components/keyboard-shortcuts";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { useKeyboardShortcut } from "@/hooks/use-keyboard-shortcut";

function RegisteredPaletteShortcut({ onRun }: { onRun: () => void }) {
  useKeyboardShortcut("palette.open", onRun);
  return <Input aria-label="Palette search" />;
}

function RegisteredNavigationShortcut({ onRun }: { onRun: () => void }) {
  useKeyboardShortcut("navigation.database-overview", onRun);
  return <p>Navigation ready</p>;
}

afterEach(() => {
  vi.useRealTimers();
});

test("question mark opens help generated from the shortcut catalog", async () => {
  const user = userEvent.setup();
  render(
    <KeyboardShortcutsProvider>
      <p>Application content</p>
    </KeyboardShortcutsProvider>
  );

  await user.keyboard("{Shift>}?{/Shift}");

  expect(
    await screen.findByRole("dialog", { name: "Keyboard shortcuts" })
  ).toBeDefined();
  expect(screen.getByText("Search or jump to")).toBeDefined();
  expect(screen.getByText("Move between cells")).toBeDefined();
});

test("question mark remains available for text entry", async () => {
  const user = userEvent.setup();
  render(
    <KeyboardShortcutsProvider>
      <Input aria-label="SQL filter" />
    </KeyboardShortcutsProvider>
  );

  await user.click(screen.getByRole("textbox", { name: "SQL filter" }));
  await user.keyboard("{Shift>}?{/Shift}");

  expect(
    screen.queryByRole("dialog", { name: "Keyboard shortcuts" })
  ).toBeNull();
  expect(screen.getByRole<HTMLInputElement>("textbox").value).toBe("?");
});

test("registered primary-modifier shortcuts work during text entry", async () => {
  const onRun = vi.fn();
  const user = userEvent.setup();
  render(
    <KeyboardShortcutsProvider>
      <RegisteredPaletteShortcut onRun={onRun} />
    </KeyboardShortcutsProvider>
  );

  await user.click(screen.getByRole("textbox", { name: "Palette search" }));
  await user.keyboard("{Control>}k{/Control}");

  expect(onRun).toHaveBeenCalledOnce();
});

test("registered key sequences run as a chord", async () => {
  const onRun = vi.fn();
  const user = userEvent.setup();
  render(
    <KeyboardShortcutsProvider>
      <RegisteredNavigationShortcut onRun={onRun} />
    </KeyboardShortcutsProvider>
  );

  await user.keyboard("go");

  expect(onRun).toHaveBeenCalledOnce();
});

test("key sequences expire after one second", () => {
  vi.useFakeTimers();
  const startedAt = new Date("2026-07-15T00:00:00Z");
  vi.setSystemTime(startedAt);
  const onRun = vi.fn();
  render(
    <KeyboardShortcutsProvider>
      <RegisteredNavigationShortcut onRun={onRun} />
    </KeyboardShortcutsProvider>
  );

  fireEvent.keyDown(window, { key: "g" });
  vi.setSystemTime(new Date(startedAt.getTime() + 1001));
  fireEvent.keyDown(window, { key: "o" });

  expect(onRun).not.toHaveBeenCalled();
});

test("help lists the active scope first", async () => {
  const user = userEvent.setup();
  render(
    <KeyboardShortcutsProvider>
      <div data-keyboard-shortcut-scope="grid">
        <Button onClick={() => undefined} type="button">
          Selected cell
        </Button>
      </div>
    </KeyboardShortcutsProvider>
  );

  await user.click(screen.getByRole("button", { name: "Selected cell" }));
  await user.keyboard("{Shift>}?{/Shift}");

  expect(
    screen
      .getAllByRole("heading", { level: 2 })
      .map((heading) => heading.textContent)
  ).toEqual(["Keyboard shortcuts", "Data grid", "General", "Navigation"]);
});

test.each([
  ["repeated", { repeat: true }],
  ["composing", { isComposing: true }],
] as const)("ignores %s shortcut events", (_label, eventInit) => {
  const onRun = vi.fn();
  render(
    <KeyboardShortcutsProvider>
      <RegisteredPaletteShortcut onRun={onRun} />
    </KeyboardShortcutsProvider>
  );

  fireEvent.keyDown(window, {
    ctrlKey: true,
    key: "k",
    ...eventInit,
  });

  expect(onRun).not.toHaveBeenCalled();
});
