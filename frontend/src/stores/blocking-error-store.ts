import { create } from "zustand";

import type { AppUiError } from "@/lib/ui-error-types";

interface BlockingErrorStoreState {
  blockingError: AppUiError | null;
  clearBlockingError: () => void;
  consumeBlockingError: () => {
    error: AppUiError | null;
    returnTo: string | null;
  };
  returnTo: string | null;
  setBlockingError: (error: AppUiError, returnTo?: string | null) => void;
}

export const useBlockingErrorStore = create<BlockingErrorStoreState>()(
  (set, get) => ({
    blockingError: null,
    clearBlockingError: () => {
      set({
        blockingError: null,
        returnTo: null,
      });
    },
    consumeBlockingError: () => {
      const current = {
        error: get().blockingError,
        returnTo: get().returnTo,
      };
      set({
        blockingError: null,
        returnTo: null,
      });
      return current;
    },
    returnTo: null,
    setBlockingError: (error, returnTo) => {
      set({
        blockingError: error,
        returnTo: returnTo ?? null,
      });
    },
  })
);
