"use client";

import { useEffect, useRef, useState } from "react";
import {
  Sheet,
  SheetContent,
  SheetDescription,
  SheetHeader,
  SheetTitle,
} from "@/components/ui/sheet";
import { KeyboardShortcutRegistrationContext } from "@/hooks/use-keyboard-shortcut";
import {
  KEYBOARD_SHORTCUTS,
  type KeyboardShortcutBinding,
  type KeyboardShortcutDefinition,
  type KeyboardShortcutGroup,
  type KeyboardShortcutId,
  type KeyboardShortcutScope,
  type KeyboardShortcutStroke,
} from "@/lib/keyboard-shortcut-registry";

const SHORTCUT_GROUPS: readonly KeyboardShortcutGroup[] = [
  "General",
  "Navigation",
  "Data grid",
];
const KEYBOARD_SHORTCUT_CHORD_TIMEOUT_MS = 1000;

function isTextEntryTarget(target: EventTarget | null): boolean {
  if (!(target instanceof Element)) {
    return false;
  }
  const contentEditable = target.closest("[contenteditable]");
  return Boolean(
    target.closest("input, textarea, select") ||
      (contentEditable &&
        contentEditable.getAttribute("contenteditable") !== "false")
  );
}

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

interface KeyboardShortcutInput {
  alt: boolean;
  key: string;
  primary: boolean;
  shift: boolean;
}

function keyboardShortcutInputFromEvent(
  event: KeyboardEvent
): KeyboardShortcutInput {
  return {
    alt: event.altKey,
    key: event.key,
    primary: event.metaKey || event.ctrlKey,
    shift: event.shiftKey,
  };
}

function matchesKeyboardShortcutStroke(
  input: KeyboardShortcutInput,
  stroke: KeyboardShortcutStroke
): boolean {
  return (
    input.key.toLowerCase() === stroke.key.toLowerCase() &&
    input.primary === Boolean(stroke.primary) &&
    input.shift === Boolean(stroke.shift) &&
    !input.alt
  );
}

function bindingMatchesPrefix(
  binding: KeyboardShortcutBinding,
  inputs: readonly KeyboardShortcutInput[]
): boolean {
  if (binding.length < inputs.length) {
    return false;
  }
  return inputs.every((input, index) => {
    const stroke = binding[index];
    return stroke ? matchesKeyboardShortcutStroke(input, stroke) : false;
  });
}

type HandledKeyboardShortcut = Extract<
  (typeof KEYBOARD_SHORTCUTS)[number],
  { kind: "handled" }
>;

type KeyboardShortcutResolution =
  | { shortcut: HandledKeyboardShortcut; status: "exact" }
  | { status: "prefix" }
  | null;

interface PendingKeyboardShortcut {
  expiresAt: number;
  inputs: readonly KeyboardShortcutInput[];
}

type KeyboardShortcutEventResolution =
  | { pending: PendingKeyboardShortcut; status: "prefix" }
  | { shortcut: HandledKeyboardShortcut; status: "exact" }
  | { status: "none" };

function shortcutIsAvailableAtScope(
  shortcut: KeyboardShortcutDefinition,
  scope: KeyboardShortcutScope
): boolean {
  return shortcut.scope === "global" || shortcut.scope === scope;
}

function availableKeyboardShortcuts(
  handlers: ReadonlyMap<KeyboardShortcutId, () => void>,
  scope: KeyboardShortcutScope
): HandledKeyboardShortcut[] {
  return KEYBOARD_SHORTCUTS.filter(
    (shortcut): shortcut is HandledKeyboardShortcut =>
      shortcut.kind === "handled" &&
      shortcutIsAvailableAtScope(shortcut, scope) &&
      (shortcut.id === "help.open" || handlers.has(shortcut.id))
  );
}

function resolveKeyboardShortcut(
  inputs: readonly KeyboardShortcutInput[],
  shortcuts: readonly HandledKeyboardShortcut[]
): KeyboardShortcutResolution {
  for (const shortcut of shortcuts) {
    const exactBinding = shortcut.bindings.find(
      (binding) =>
        binding.length === inputs.length &&
        bindingMatchesPrefix(binding, inputs)
    );
    if (exactBinding) {
      return { shortcut, status: "exact" };
    }
  }
  const hasPrefix = shortcuts.some((shortcut) =>
    shortcut.bindings.some(
      (binding) =>
        binding.length > inputs.length && bindingMatchesPrefix(binding, inputs)
    )
  );
  return hasPrefix ? { status: "prefix" } : null;
}

function activePendingInputs(
  pending: PendingKeyboardShortcut | undefined
): readonly KeyboardShortcutInput[] {
  if (!pending) {
    return [];
  }
  return pending.expiresAt >= Date.now() ? pending.inputs : [];
}

function resolveKeyboardShortcutEvent({
  event,
  handlers,
  pending,
}: {
  event: KeyboardEvent;
  handlers: ReadonlyMap<KeyboardShortcutId, () => void>;
  pending: PendingKeyboardShortcut | undefined;
}): KeyboardShortcutEventResolution {
  if (event.isComposing || event.repeat) {
    return { status: "none" };
  }
  const input = keyboardShortcutInputFromEvent(event);
  if (isTextEntryTarget(event.target) && !input.primary) {
    return { status: "none" };
  }

  const availableShortcuts = availableKeyboardShortcuts(
    handlers,
    resolveKeyboardShortcutScope(event.target)
  );
  const pendingInputs = activePendingInputs(pending);
  const sequence = [...pendingInputs, input];
  const sequenceResolution = resolveKeyboardShortcut(
    sequence,
    availableShortcuts
  );
  const resolution =
    sequenceResolution ?? resolveKeyboardShortcut([input], availableShortcuts);
  if (!resolution) {
    return { status: "none" };
  }
  if (resolution.status === "prefix") {
    return {
      pending: {
        expiresAt: Date.now() + KEYBOARD_SHORTCUT_CHORD_TIMEOUT_MS,
        inputs: sequenceResolution ? sequence : [input],
      },
      status: "prefix",
    };
  }
  return resolution;
}

function pendingAfterResolution(
  resolution: KeyboardShortcutEventResolution
): PendingKeyboardShortcut | undefined {
  return resolution.status === "prefix" ? resolution.pending : undefined;
}

function executeKeyboardShortcut({
  event,
  handlers,
  onOpenHelp,
  shortcut,
}: {
  event: KeyboardEvent;
  handlers: ReadonlyMap<KeyboardShortcutId, () => void>;
  onOpenHelp: (scope: KeyboardShortcutScope) => void;
  shortcut: HandledKeyboardShortcut;
}) {
  if (shortcut.id === "help.open") {
    onOpenHelp(resolveKeyboardShortcutScope(event.target));
    return;
  }
  handlers.get(shortcut.id)?.();
}

function KeyboardShortcutKeys({ keys }: { keys: readonly string[] }) {
  return (
    <span aria-hidden="true" className="flex shrink-0 items-center gap-1">
      {keys.map((key) => (
        <kbd
          className="flex min-w-6 items-center justify-center rounded-md border bg-muted px-1.5 py-1 font-mono text-[11px] text-muted-foreground shadow-xs"
          key={key}
        >
          {key}
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
      <SheetContent className="w-full gap-0 sm:max-w-md" side="right">
        <SheetHeader className="border-b px-5 py-4 pr-14">
          <SheetTitle className="text-base">Keyboard shortcuts</SheetTitle>
          <SheetDescription>
            Work faster without leaving the keyboard.
          </SheetDescription>
        </SheetHeader>
        <div className="flex-1 overflow-y-auto px-5 py-4">
          {orderedGroups.map((group) => (
            <section className="not-last:mb-6" key={group}>
              <h2 className="mb-2 font-medium text-muted-foreground text-xs uppercase tracking-wide">
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
  const handlersRef = useRef(new Map<KeyboardShortcutId, () => void>());

  function register(id: KeyboardShortcutId, handler: () => void) {
    handlersRef.current.set(id, handler);
    return () => {
      if (handlersRef.current.get(id) === handler) {
        handlersRef.current.delete(id);
      }
    };
  }

  useEffect(function listenForKeyboardShortcuts() {
    let pending: PendingKeyboardShortcut | undefined;

    function openHelp(scope: KeyboardShortcutScope) {
      setHelpScope(scope);
      setHelpOpen(true);
    }

    function handleKeyDown(event: KeyboardEvent) {
      const resolution = resolveKeyboardShortcutEvent({
        event,
        handlers: handlersRef.current,
        pending,
      });
      pending = pendingAfterResolution(resolution);
      if (resolution.status === "none") {
        return;
      }

      event.preventDefault();
      if (resolution.status === "prefix") {
        return;
      }
      executeKeyboardShortcut({
        event,
        handlers: handlersRef.current,
        onOpenHelp: openHelp,
        shortcut: resolution.shortcut,
      });
    }

    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, []);

  return (
    <KeyboardShortcutRegistrationContext value={register}>
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
