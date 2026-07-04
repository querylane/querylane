import { afterEach, beforeEach, describe, expect, test, vi } from "vitest";
import { waitForNextFrame } from "@/lib/wait-for-next-frame";

describe("waitForNextFrame (DOM environment: window is defined)", () => {
  beforeEach(() => {
    vi.useFakeTimers();
  });

  afterEach(() => {
    vi.restoreAllMocks();
    vi.useRealTimers();
  });

  test("resolves after requestAnimationFrame fires", async () => {
    // happy-dom provides window and requestAnimationFrame
    expect(typeof window).toBe("object");

    const rafSpy = vi
      .spyOn(window, "requestAnimationFrame")
      .mockImplementation((cb) => {
        // invoke callback synchronously so we can control timing
        cb(0);
        return 0;
      });

    await expect(waitForNextFrame()).resolves.toBeUndefined();
    expect(rafSpy).toHaveBeenCalledOnce();
  });

  test("does not resolve before requestAnimationFrame fires", async () => {
    let rafCallback: FrameRequestCallback | null = null;

    vi.spyOn(window, "requestAnimationFrame").mockImplementation((cb) => {
      rafCallback = cb;
      return 0;
    });

    let resolved = false;
    const promise = waitForNextFrame().then(() => {
      resolved = true;
    });

    // frame has not fired yet
    expect(resolved).toBe(false);

    // fire the frame
    rafCallback!(0);
    await promise;

    expect(resolved).toBe(true);
  });
});
