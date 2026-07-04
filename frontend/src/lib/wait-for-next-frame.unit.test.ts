import { describe, expect, test } from "vitest";
import { waitForNextFrame } from "@/lib/wait-for-next-frame";

describe("waitForNextFrame (node environment: window is undefined)", () => {
  test("resolves immediately when window is undefined", async () => {
    // In the node vitest environment, window is not defined, so the early
    // resolve() branch is taken.
    await expect(waitForNextFrame()).resolves.toBeUndefined();
  });

  test("returns a Promise", () => {
    const result = waitForNextFrame();
    expect(result).toBeInstanceOf(Promise);
    // consume the promise to avoid unhandled rejection noise
    return result;
  });

  test("can be awaited multiple times without error", async () => {
    await waitForNextFrame();
    await waitForNextFrame();
    await waitForNextFrame();
  });
});
