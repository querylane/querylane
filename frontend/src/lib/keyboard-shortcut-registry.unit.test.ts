import { expect, test } from "vitest";
import {
  findKeyboardShortcutConflicts,
  KEYBOARD_SHORTCUTS,
} from "@/lib/keyboard-shortcut-registry";

test("reports duplicate bindings within the same scope", () => {
  expect(
    findKeyboardShortcutConflicts([
      {
        bindings: [[{ key: "k", primary: true }]],
        id: "first",
        scope: "global",
      },
      {
        bindings: [[{ key: "K", primary: true }]],
        id: "second",
        scope: "global",
      },
    ])
  ).toEqual([
    {
      binding: "mod+k",
      ids: ["first", "second"],
      scope: "global",
    },
  ]);
});

test("allows a binding to be reused in another scope", () => {
  expect(
    findKeyboardShortcutConflicts([
      {
        bindings: [[{ key: "c", primary: true }]],
        id: "global-copy",
        scope: "global",
      },
      {
        bindings: [[{ key: "c", primary: true }]],
        id: "grid-copy",
        scope: "grid",
      },
    ])
  ).toEqual([]);
});

test("defines the agreed shortcut set centrally", () => {
  expect(KEYBOARD_SHORTCUTS.map(({ id, scope }) => `${scope}:${id}`)).toEqual([
    "global:help.open",
    "global:palette.open",
    "global:sidebar.toggle",
    "global:overlay.close",
    "global:navigation.database-overview",
    "global:navigation.data-explorer",
    "global:navigation.roles",
    "global:navigation.extensions",
    "global:navigation.configuration",
    "global:navigation.instance-overview",
    "grid:grid.move",
    "grid:grid.copy",
  ]);
});

test("keeps the shipped shortcut catalog conflict-free", () => {
  expect(findKeyboardShortcutConflicts(KEYBOARD_SHORTCUTS)).toEqual([]);
});
