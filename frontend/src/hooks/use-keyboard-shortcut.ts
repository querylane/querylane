import { createContext, use, useEffect } from "react";
import type { KeyboardShortcutId } from "@/lib/keyboard-shortcut-registry";

type RegisterKeyboardShortcut = (
  id: KeyboardShortcutId,
  handler: () => void
) => () => void;

const KeyboardShortcutRegistrationContext =
  createContext<RegisterKeyboardShortcut | null>(null);

function useKeyboardShortcut(id: KeyboardShortcutId, handler: () => void) {
  const register = use(KeyboardShortcutRegistrationContext);
  if (!register) {
    throw new Error(
      "useKeyboardShortcut must be used within KeyboardShortcutsProvider."
    );
  }

  useEffect(
    function registerKeyboardShortcut() {
      return register(id, handler);
    },
    [handler, id, register]
  );
}

export type { RegisterKeyboardShortcut };
export { KeyboardShortcutRegistrationContext, useKeyboardShortcut };
