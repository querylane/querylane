type KeyboardShortcutScope = "editor" | "global" | "grid";

interface KeyboardShortcutStroke {
  key: string;
  primary?: true | undefined;
  shift?: true | undefined;
}

type KeyboardShortcutBinding = readonly KeyboardShortcutStroke[];

interface KeyboardShortcutConflictCandidate {
  bindings: readonly KeyboardShortcutBinding[];
  id: string;
  scope: KeyboardShortcutScope;
}

interface KeyboardShortcutConflict {
  binding: string;
  ids: string[];
  scope: KeyboardShortcutScope;
}

type KeyboardShortcutGroup = "Data grid" | "General" | "Navigation";

interface KeyboardShortcutDefinition extends KeyboardShortcutConflictCandidate {
  description: string;
  displayKeys: readonly string[];
  group: KeyboardShortcutGroup;
  kind: "handled" | "native";
}

function keyboardShortcutBindingKey(binding: KeyboardShortcutBinding): string {
  return binding
    .map((stroke) => {
      const modifiers = [
        stroke.primary ? "mod" : null,
        stroke.shift ? "shift" : null,
      ].filter(Boolean);
      return [...modifiers, stroke.key.toLowerCase()].join("+");
    })
    .join(" ");
}

function findKeyboardShortcutConflicts(
  candidates: readonly KeyboardShortcutConflictCandidate[]
): KeyboardShortcutConflict[] {
  const bindings = new Map<
    string,
    { binding: string; ids: string[]; scope: KeyboardShortcutScope }
  >();

  for (const candidate of candidates) {
    for (const binding of candidate.bindings) {
      const bindingKey = keyboardShortcutBindingKey(binding);
      const identity = `${candidate.scope}:${bindingKey}`;
      const existing = bindings.get(identity);
      if (existing) {
        existing.ids.push(candidate.id);
      } else {
        bindings.set(identity, {
          binding: bindingKey,
          ids: [candidate.id],
          scope: candidate.scope,
        });
      }
    }
  }

  return [...bindings.values()].filter(({ ids }) => ids.length > 1);
}

const KEYBOARD_SHORTCUTS = [
  {
    bindings: [[{ key: "?", shift: true }]],
    description: "Show keyboard shortcuts",
    displayKeys: ["?"],
    group: "General",
    id: "help.open",
    kind: "handled",
    scope: "global",
  },
  {
    bindings: [[{ key: "k", primary: true }]],
    description: "Search or jump to",
    displayKeys: ["⌘/Ctrl", "K"],
    group: "General",
    id: "palette.open",
    kind: "handled",
    scope: "global",
  },
  {
    bindings: [[{ key: "b", primary: true }]],
    description: "Toggle sidebar",
    displayKeys: ["⌘/Ctrl", "B"],
    group: "General",
    id: "sidebar.toggle",
    kind: "handled",
    scope: "global",
  },
  {
    bindings: [[{ key: "Escape" }]],
    description: "Close dialog or drawer",
    displayKeys: ["Esc"],
    group: "General",
    id: "overlay.close",
    kind: "native",
    scope: "global",
  },
  {
    bindings: [[{ key: "g" }, { key: "o" }]],
    description: "Go to database overview",
    displayKeys: ["G", "O"],
    group: "Navigation",
    id: "navigation.database-overview",
    kind: "handled",
    scope: "global",
  },
  {
    bindings: [[{ key: "g" }, { key: "d" }]],
    description: "Go to Data Explorer",
    displayKeys: ["G", "D"],
    group: "Navigation",
    id: "navigation.data-explorer",
    kind: "handled",
    scope: "global",
  },
  {
    bindings: [[{ key: "g" }, { key: "r" }]],
    description: "Go to roles",
    displayKeys: ["G", "R"],
    group: "Navigation",
    id: "navigation.roles",
    kind: "handled",
    scope: "global",
  },
  {
    bindings: [[{ key: "g" }, { key: "e" }]],
    description: "Go to extensions",
    displayKeys: ["G", "E"],
    group: "Navigation",
    id: "navigation.extensions",
    kind: "handled",
    scope: "global",
  },
  {
    bindings: [[{ key: "g" }, { key: "c" }]],
    description: "Go to configuration",
    displayKeys: ["G", "C"],
    group: "Navigation",
    id: "navigation.configuration",
    kind: "handled",
    scope: "global",
  },
  {
    bindings: [[{ key: "g" }, { key: "i" }]],
    description: "Go to instance overview",
    displayKeys: ["G", "I"],
    group: "Navigation",
    id: "navigation.instance-overview",
    kind: "handled",
    scope: "global",
  },
  {
    bindings: [
      [{ key: "ArrowUp" }],
      [{ key: "ArrowDown" }],
      [{ key: "ArrowLeft" }],
      [{ key: "ArrowRight" }],
    ],
    description: "Move between cells",
    displayKeys: ["↑", "↓", "←", "→"],
    group: "Data grid",
    id: "grid.move",
    kind: "native",
    scope: "grid",
  },
  {
    bindings: [[{ key: "Home" }], [{ key: "End" }]],
    description: "Move to row edge",
    displayKeys: ["Home", "End"],
    group: "Data grid",
    id: "grid.move-to-row-edge",
    kind: "native",
    scope: "grid",
  },
  {
    bindings: [
      [{ key: "ArrowUp", primary: true }],
      [{ key: "ArrowDown", primary: true }],
      [{ key: "ArrowLeft", primary: true }],
      [{ key: "ArrowRight", primary: true }],
      [{ key: "Home", primary: true }],
      [{ key: "End", primary: true }],
    ],
    description: "Move to grid edge",
    displayKeys: ["⌘/Ctrl", "↑", "↓", "←", "→", "Home", "End"],
    group: "Data grid",
    id: "grid.move-to-grid-edge",
    kind: "native",
    scope: "grid",
  },
  {
    bindings: [[{ key: "PageUp" }], [{ key: "PageDown" }]],
    description: "Move by one visible page",
    displayKeys: ["Page Up", "Page Down"],
    group: "Data grid",
    id: "grid.move-by-page",
    kind: "native",
    scope: "grid",
  },
  {
    bindings: [
      [{ key: "ArrowUp", shift: true }],
      [{ key: "ArrowDown", shift: true }],
      [{ key: "ArrowLeft", shift: true }],
      [{ key: "ArrowRight", shift: true }],
    ],
    description: "Extend cell selection",
    displayKeys: ["Shift", "↑", "↓", "←", "→"],
    group: "Data grid",
    id: "grid.extend-selection",
    kind: "native",
    scope: "grid",
  },
  {
    bindings: [[{ key: "Home", shift: true }], [{ key: "End", shift: true }]],
    description: "Extend selection to row edge",
    displayKeys: ["Shift", "Home", "End"],
    group: "Data grid",
    id: "grid.extend-to-row-edge",
    kind: "native",
    scope: "grid",
  },
  {
    bindings: [
      [{ key: "ArrowUp", primary: true, shift: true }],
      [{ key: "ArrowDown", primary: true, shift: true }],
      [{ key: "ArrowLeft", primary: true, shift: true }],
      [{ key: "ArrowRight", primary: true, shift: true }],
      [{ key: "Home", primary: true, shift: true }],
      [{ key: "End", primary: true, shift: true }],
    ],
    description: "Extend selection to grid edge",
    displayKeys: ["⌘/Ctrl", "Shift", "↑", "↓", "←", "→"],
    group: "Data grid",
    id: "grid.extend-to-grid-edge",
    kind: "native",
    scope: "grid",
  },
  {
    bindings: [
      [{ key: "PageUp", shift: true }],
      [{ key: "PageDown", shift: true }],
    ],
    description: "Extend selection by one visible page",
    displayKeys: ["Shift", "Page Up", "Page Down"],
    group: "Data grid",
    id: "grid.extend-by-page",
    kind: "native",
    scope: "grid",
  },
  {
    bindings: [[{ key: "a", primary: true }]],
    description: "Select all cells on this page",
    displayKeys: ["⌘/Ctrl", "A"],
    group: "Data grid",
    id: "grid.select-all-cells",
    kind: "native",
    scope: "grid",
  },
  {
    bindings: [[{ key: "c", primary: true }]],
    description: "Copy selected cells",
    displayKeys: ["⌘/Ctrl", "C"],
    group: "Data grid",
    id: "grid.copy",
    kind: "native",
    scope: "grid",
  },
  {
    bindings: [[{ key: "Escape" }]],
    description: "Clear cell selection",
    displayKeys: ["Esc"],
    group: "Data grid",
    id: "grid.clear-selection",
    kind: "native",
    scope: "grid",
  },
] as const satisfies readonly KeyboardShortcutDefinition[];

const KEYBOARD_SHORTCUT_CONFLICTS =
  findKeyboardShortcutConflicts(KEYBOARD_SHORTCUTS);

if (import.meta.env.DEV && KEYBOARD_SHORTCUT_CONFLICTS.length > 0) {
  const conflictSummary = KEYBOARD_SHORTCUT_CONFLICTS.map(
    ({ binding, ids, scope }) => `${scope}:${binding} (${ids.join(", ")})`
  ).join("; ");
  throw new Error(`Keyboard shortcut conflicts: ${conflictSummary}`);
}

type KeyboardShortcutId = (typeof KEYBOARD_SHORTCUTS)[number]["id"];

export type {
  KeyboardShortcutBinding,
  KeyboardShortcutConflictCandidate,
  KeyboardShortcutDefinition,
  KeyboardShortcutGroup,
  KeyboardShortcutId,
  KeyboardShortcutScope,
  KeyboardShortcutStroke,
};
export {
  findKeyboardShortcutConflicts,
  KEYBOARD_SHORTCUTS,
  keyboardShortcutBindingKey,
};
