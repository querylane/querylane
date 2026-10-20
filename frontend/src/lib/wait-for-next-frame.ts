export function waitForNextFrame() {
  return new Promise<void>((resolve) => {
    if (globalThis.window === undefined) {
      resolve();
      return;
    }

    globalThis.window.requestAnimationFrame(() => {
      resolve();
    });
  });
}
