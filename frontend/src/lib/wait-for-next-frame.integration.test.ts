import {
  afterEach,
  beforeEach,
  describe,
  expect,
  rs,
  test,
} from "@rstest/core";
import { waitForNextFrame } from "@/lib/wait-for-next-frame";

describe("waitForNextFrame (DOM environment: window is defined)", () => {
  beforeEach(() => {
    rs.useFakeTimers();
  });

  afterEach(() => {
    rs.restoreAllMocks();
    rs.useRealTimers();
  });

  test("resolves after requestAnimationFrame fires", async () => {
    // happy-dom provides window and requestAnimationFrame
    expect(typeof window).toBe("object");

    const rafSpy = rs
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
    const rafState: { callback?: FrameRequestCallback } = {};

    rs.spyOn(window, "requestAnimationFrame").mockImplementation((cb) => {
      rafState.callback = cb;
      return 0;
    });

    let resolved = false;
    const promise = waitForNextFrame().then(() => {
      resolved = true;
    });

    // frame has not fired yet
    expect(resolved).toBe(false);

    // fire the frame
    rafState.callback?.(0);
    await promise;

    expect(resolved).toBe(true);
  });
});
