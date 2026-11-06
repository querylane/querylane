import type { act } from "react";

/** Preserve async act's flush and rejection contract for synchronous updates. */
function actSynchronous(
  reactAct: typeof act,
  update: () => void
): Promise<void> {
  return reactAct(
    () =>
      new Promise<void>((resolve) => {
        update();
        resolve();
      })
  );
}

export { actSynchronous };
