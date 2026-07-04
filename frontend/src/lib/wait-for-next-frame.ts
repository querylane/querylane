export function waitForNextFrame() {
  return new Promise<void>((resolve) => {
    if (typeof window === "undefined") {
      resolve();
      return;
    }

    window.requestAnimationFrame(() => {
      resolve();
    });
  });
}
