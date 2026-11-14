"use client";

import { useShortcut, useShortcutHint } from "@ui-sdk/react/shortcuts";
import { useEffect, useRef, useState } from "react";
import {
  Sheet,
  SheetContent,
  SheetDescription,
  SheetHeader,
  SheetTitle,
} from "@/components/querylane-ui/sheet";
import { KeyboardShortcutRegistrationContext } from "@/hooks/use-keyboard-shortcut";
import {
  KEYBOARD_SHORTCUTS,
  type KeyboardShortcutGroup,
  type KeyboardShortcutScope,
  keyboardShortcutBindingKey,
} from "@/lib/keyboard-shortcut-registry";

const SHORTCUT_GROUPS: readonly KeyboardShortcutGroup[] = [
  "General",
  "Navigation",
  "SQL workbench",
  "Data grid",
];
const KEYBOARD_SHORTCUT_CHORD_TIMEOUT_MS = 1000;

function resolveKeyboardShortcutScope(
  target: EventTarget | null
): KeyboardShortcutScope {
  if (!(target instanceof Element)) {
    return "global";
  }
  const scope = target
    .closest("[data-keyboard-shortcut-scope]")
    ?.getAttribute("data-keyboard-shortcut-scope");
  return scope === "editor" || scope === "grid" ? scope : "global";
}

// The SDK owns key matching, input/IME guards, modal-layer priority and cleanup.
// Only the app's two-stroke navigation sequence needs a small adapter.
const CHORD_PREFIXES = [
  ...new Set(
    KEYBOARD_SHORTCUTS.flatMap((shortcut) => {
      const prefixes: string[] = [];
      if (shortcut.kind === "handled") {
        for (const binding of shortcut.bindings) {
          if (binding.length > 1) {
            prefixes.push(keyboardShortcutBindingKey(binding.slice(0, -1)));
          }
        }
      }
      return prefixes;
    })
  ),
];

interface PendingChord {
  event: KeyboardEvent;
  expiresAt: number;
  prefix: string;
}

function ChordPrefix({
  active,
  onStart,
  prefix,
}: {
  active: () => boolean;
  onStart: (event: KeyboardEvent, prefix: string) => void;
  prefix: string;
}) {
  useShortcut(
    prefix,
    (event) => {
      onStart(event, prefix);
    },
    { when: active }
  );
  return null;
}

function KeyboardShortcutKeys({ keys }: { keys: readonly string[] }) {
  const modifier = useShortcutHint("mod");
  return (
    <span aria-hidden="true" className="flex shrink-0 items-center gap-1">
      {keys.map((key) => (
        <kbd
          className="flex min-w-6 items-center justify-center rounded-md border bg-muted px-1.5 py-1 font-mono text-(length:--text-label-sm) text-muted-foreground shadow-xs"
          key={key}
        >
          {key === "⌘/Ctrl" ? modifier.text : key}
        </kbd>
      ))}
    </span>
  );
}

function KeyboardShortcutHelpSheet({
  activeScope,
  onOpenChange,
  open,
}: {
  activeScope: KeyboardShortcutScope;
  onOpenChange: (open: boolean) => void;
  open: boolean;
}) {
  const activeGroups = SHORTCUT_GROUPS.filter((group) =>
    KEYBOARD_SHORTCUTS.some(
      (shortcut) => shortcut.group === group && shortcut.scope === activeScope
    )
  );
  const orderedGroups = [
    ...activeGroups,
    ...SHORTCUT_GROUPS.filter((group) => !activeGroups.includes(group)),
  ];

  return (
    <Sheet onOpenChange={onOpenChange} open={open}>
      <SheetContent
        className="w-full sm:max-w-md"
        presentation="flush"
        side="right"
      >
        <SheetHeader presentation="drawer">
          <SheetTitle presentation="heading">Keyboard shortcuts</SheetTitle>
          <SheetDescription>
            Work faster without leaving the keyboard.
          </SheetDescription>
        </SheetHeader>
        <div className="flex-1 overflow-y-auto px-5 py-4">
          {orderedGroups.map((group) => (
            <section className="not-last:mb-6" key={group}>
              <h2 className="mb-2 text-xs font-medium tracking-wide text-muted-foreground uppercase">
                {group}
              </h2>
              <ul className="divide-y rounded-lg border">
                {KEYBOARD_SHORTCUTS.map((shortcut) =>
                  shortcut.group === group ? (
                    <li
                      className="flex min-h-11 items-center justify-between gap-4 px-3 py-2.5"
                      key={shortcut.id}
                    >
                      <span>{shortcut.description}</span>
                      <KeyboardShortcutKeys keys={shortcut.displayKeys} />
                    </li>
                  ) : null
                )}
              </ul>
            </section>
          ))}
        </div>
      </SheetContent>
    </Sheet>
  );
}

function KeyboardShortcutsProvider({
  children,
}: {
  children: React.ReactNode;
}) {
  const [helpOpen, setHelpOpen] = useState(false);
  const [helpScope, setHelpScope] = useState<KeyboardShortcutScope>("global");
  const prefixesRef = useRef(new Map<string, number>());
  const pendingRef = useRef<PendingChord | undefined>(undefined);

  function registerPrefix(prefix: string) {
    prefixesRef.current.set(prefix, (prefixesRef.current.get(prefix) ?? 0) + 1);
    return () => {
      const remaining = (prefixesRef.current.get(prefix) ?? 1) - 1;
      if (remaining > 0) {
        prefixesRef.current.set(prefix, remaining);
      } else {
        prefixesRef.current.delete(prefix);
        pendingRef.current = undefined;
      }
    };
  }

  function isChordPending(prefix: string) {
    return (
      pendingRef.current?.prefix === prefix &&
      pendingRef.current.expiresAt >= Date.now()
    );
  }

  function startChord(event: KeyboardEvent, prefix: string) {
    pendingRef.current = {
      event,
      prefix,
      expiresAt: Date.now() + KEYBOARD_SHORTCUT_CHORD_TIMEOUT_MS,
    };
  }

  useShortcut(
    "shift+?",
    (event) => {
      setHelpScope(resolveKeyboardShortcutScope(event.target));
      setHelpOpen(true);
    },
    { description: "Show keyboard shortcuts" }
  );

  useEffect(function resetChordAfterNextStroke() {
    function reset(event: KeyboardEvent) {
      // SDK handlers run on document before this window listener. A second
      // stroke consumes the prefix even when no command matched.
      if (event !== pendingRef.current?.event) {
        pendingRef.current = undefined;
      }
    }
    globalThis.window.addEventListener("keydown", reset);
    return () => {
      globalThis.window.removeEventListener("keydown", reset);
    };
  }, []);

  return (
    <KeyboardShortcutRegistrationContext
      value={{ registerPrefix, isChordPending }}
    >
      {CHORD_PREFIXES.map((prefix) => (
        <ChordPrefix
          active={() => prefixesRef.current.has(prefix)}
          key={prefix}
          onStart={startChord}
          prefix={prefix}
        />
      ))}
      {children}
      <KeyboardShortcutHelpSheet
        activeScope={helpScope}
        onOpenChange={setHelpOpen}
        open={helpOpen}
      />
    </KeyboardShortcutRegistrationContext>
  );
}

export { KeyboardShortcutsProvider };
