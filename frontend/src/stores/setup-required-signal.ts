let setupRequiredHandler: (() => void) | undefined;

export function registerSetupRequiredHandler(handler: () => void) {
  setupRequiredHandler = handler;
  return () => {
    if (setupRequiredHandler === handler) {
      setupRequiredHandler = undefined;
    }
  };
}

export function markSetupRequired() {
  setupRequiredHandler?.();
}
