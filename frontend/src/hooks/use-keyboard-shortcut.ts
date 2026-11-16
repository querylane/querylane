import { createContext, use, useEffect } from "react";
import { useUiShortcut as useShortcut } from "@/hooks/use-ui-shortcut";
import {
  KEYBOARD_SHORTCUTS,
  keyboardShortcutBindingKey,
} from "@/lib/keyboard-shortcut-registry";

type HandledKeyboardShortcutId = Extract<
  (typeof KEYBOARD_SHORTCUTS)[number],
  { kind: "handled" }
>["id"];

interface KeyboardShortcutRegistration {
  isChordPending: (prefix: string) => boolean;
  registerPrefix: (prefix: string) => () => void;
}

const KeyboardShortcutRegistrationContext =
  createContext<KeyboardShortcutRegistration | null>(null);

function useKeyboardShortcut(
  id: HandledKeyboardShortcutId,
  handler: () => void
) {
  const registration = use(KeyboardShortcutRegistrationContext);
  if (!registration) {
    throw new Error(
      "useKeyboardShortcut must be used within KeyboardShortcutsProvider."
    );
  }
  const shortcut = KEYBOARD_SHORTCUTS.find((entry) => entry.id === id);
  const binding = shortcut?.bindings[0] ?? [];
  const prefix = keyboardShortcutBindingKey(binding.slice(0, -1));
  const keys = keyboardShortcutBindingKey(binding.slice(-1));
  useShortcut(keys, handler, {
    description: shortcut?.description ?? id,
    when: () => prefix === "" || registration.isChordPending(prefix),
  });
  useEffect(
    function registerChordPrefix() {
      return prefix ? registration.registerPrefix(prefix) : undefined;
    },
    [prefix, registration]
  );
}

export { KeyboardShortcutRegistrationContext, useKeyboardShortcut };
