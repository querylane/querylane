let setupRequiredHandler: (() => void) | undefined;

export function registerSetupRequiredHandler(handler: () => void) {
  setupRequiredHandler = handler;
}

export function markSetupRequired() {
  setupRequiredHandler?.();
}
