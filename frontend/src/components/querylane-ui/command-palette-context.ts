"use client";

import { createContext, use } from "react";

interface CommandPaletteController {
  openPalette: () => void;
}

const CommandPaletteContext = createContext<CommandPaletteController | null>(
  null
);

function useCommandPalette(): CommandPaletteController {
  const controller = use(CommandPaletteContext);
  if (!controller) {
    throw new Error(
      "useCommandPalette must be used within a CommandPaletteProvider."
    );
  }
  return controller;
}

export type { CommandPaletteController };
export { CommandPaletteContext, useCommandPalette };
