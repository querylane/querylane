import { page } from "@rstest/browser";
import { expect, test } from "@rstest/core";
import { useState } from "react";
import { render } from "@/__tests__/render-ui";
import { KeyboardShortcutsProvider } from "@/components/keyboard-shortcuts";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { useKeyboardShortcut } from "@/hooks/use-keyboard-shortcut";

function RegisteredCommands({ onRun }: { onRun: () => void }) {
  useKeyboardShortcut("palette.open", onRun);
  useKeyboardShortcut("navigation.data-explorer", onRun);
  return null;
}

function ShortcutHarness() {
  const [count, setCount] = useState(0);
  const [enabled, setEnabled] = useState(true);
  const [step, setStep] = useState(1);
  return (
    <KeyboardShortcutsProvider>
      {enabled ? (
        <RegisteredCommands
          onRun={() => {
            setCount(count + step);
          }}
        />
      ) : null}
      <output aria-label="Commands run">{count}</output>
      <Input aria-label="Draft" />
      <Button
        onClick={() => {
          setEnabled(!enabled);
        }}
        type="button"
      >
        Toggle commands
      </Button>
      <Button
        onClick={() => {
          setStep(10);
        }}
        type="button"
      >
        Change handler
      </Button>
      <Dialog>
        <DialogTrigger render={<Button type="button">Settings</Button>} />
        <DialogContent>
          <DialogTitle>Settings</DialogTitle>
          <Input aria-label="Dialog draft" />
        </DialogContent>
      </Dialog>
    </KeyboardShortcutsProvider>
  );
}

function primaryShortcut() {
  return navigator.platform.startsWith("Mac") ? "Meta+k" : "Control+k";
}

function commandsRun() {
  return page.getByRole("status", { name: "Commands run" });
}

test("sdk shortcuts preserve chords, discard interrupted chords, and leave typing alone", async () => {
  await render(<ShortcutHarness />);
  const body = page.locator("body");
  await body.press("g");
  await body.press("d");
  await expect.element(commandsRun()).toHaveText("1");
  await body.press("g");
  await body.press("x");
  await body.press("d");
  await expect.element(commandsRun()).toHaveText("1");
  const input = page.getByRole("textbox", { name: "Draft", exact: true });
  await input.click();
  await input.press("g");
  await input.press("d");
  await expect.element(commandsRun()).toHaveText("1");
  await expect.element(input).toHaveValue("gd");
  await input.press(primaryShortcut());
  await expect.element(commandsRun()).toHaveText("2");
});

test("page shortcuts pause for a modal and resume after dismissal", async () => {
  await render(<ShortcutHarness />);
  await page.getByRole("button", { name: "Settings", exact: true }).click();
  const input = page.getByRole("textbox", { name: "Dialog draft" });
  await input.press(primaryShortcut());
  // Base UI correctly makes the background counter inaccessible while modal.
  await expect
    .element(page.locator('output[aria-label="Commands run"]'))
    .toHaveText("0");
  // Even a chord started outside a text field must not navigate behind a modal.
  await page.getByRole("heading", { name: "Settings" }).click();
  await page.locator("body").press("g");
  await page.locator("body").press("d");
  // Base UI correctly makes the background counter inaccessible while modal.
  await expect
    .element(page.locator('output[aria-label="Commands run"]'))
    .toHaveText("0");
  await page.locator("body").press("Escape");
  await expect
    .element(page.getByRole("dialog", { name: "Settings" }))
    .not.toBeVisible();
  await page.locator("body").press(primaryShortcut());
  await expect.element(commandsRun()).toHaveText("1");
});

test("shortcut registrations use the latest handler and clean up across remounts", async () => {
  await render(<ShortcutHarness />);
  const body = page.locator("body");
  await body.press(primaryShortcut());
  await expect.element(commandsRun()).toHaveText("1");
  await page.getByRole("button", { name: "Change handler" }).click();
  await body.press(primaryShortcut());
  await expect.element(commandsRun()).toHaveText("11");
  await page.getByRole("button", { name: "Toggle commands" }).click();
  await body.press(primaryShortcut());
  await body.press("g");
  await body.press("d");
  await expect.element(commandsRun()).toHaveText("11");
  await page.getByRole("button", { name: "Toggle commands" }).click();
  await body.press("g");
  await body.press("d");
  await expect.element(commandsRun()).toHaveText("21");
});
