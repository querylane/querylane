import { beforeEach, describe, expect, rs, test } from "@rstest/core";
import {
  createMemoryHistory,
  createRootRoute,
  createRoute,
  createRouter,
} from "@tanstack/react-router";
import { scheduleRouteCodeWarmup } from "@/lib/route-code-warmup";

describe("route code warmup", () => {
  const idleCallbacks = new Map<number, IdleRequestCallback>();
  let nextId = 0;

  beforeEach(() => {
    idleCallbacks.clear();
    rs.spyOn(document, "readyState", "get").mockReturnValue("complete");
    rs.spyOn(document, "visibilityState", "get").mockReturnValue("visible");
    rs.spyOn(navigator, "onLine", "get").mockReturnValue(true);
    rs.stubGlobal("requestIdleCallback", (callback: IdleRequestCallback) => {
      nextId += 1;
      const id = nextId;
      idleCallbacks.set(id, callback);
      return id;
    });
    rs.stubGlobal("cancelIdleCallback", (id: number) => {
      idleCallbacks.delete(id);
    });
  });

  function runIdle(timeRemaining = 50) {
    const next = idleCallbacks.entries().next().value;
    if (!next) {
      throw new Error("Expected scheduled idle work");
    }
    const [id, callback] = next;
    idleCallbacks.delete(id);
    callback({ didTimeout: false, timeRemaining: () => timeRemaining });
  }

  function startWarmup(canWarm = () => true) {
    const loadRouteChunk = rs.fn();
    const onError = rs.fn();
    const cleanup = scheduleRouteCodeWarmup({
      canWarm,
      onError,
      router: { loadRouteChunk },
      routes: [createRootRoute(), createRootRoute()],
    });
    return { cleanup, loadRouteChunk, onError };
  }

  test("warms code at idle without running route guards, loaders, or rendering", () => {
    const beforeLoad = rs.fn();
    const loader = rs.fn();
    const component = rs.fn(() => null);
    const preload = rs.fn(async () => undefined);
    const root = createRootRoute();
    const target = createRoute({
      beforeLoad,
      component: Object.assign(component, { preload }),
      getParentRoute: () => root,
      loader,
      path: "/target",
    });
    const router = createRouter({
      history: createMemoryHistory(),
      routeTree: root.addChildren([target]),
    });
    const cleanup = scheduleRouteCodeWarmup({
      canWarm: () => true,
      onError: rs.fn(),
      router,
      routes: [target],
    });

    expect(preload).not.toHaveBeenCalled();
    runIdle();
    expect(preload).toHaveBeenCalledTimes(1);
    expect(beforeLoad).not.toHaveBeenCalled();
    expect(loader).not.toHaveBeenCalled();
    expect(component).not.toHaveBeenCalled();
    cleanup();
  });

  test.each([
    { effectiveType: "4g", saveData: true },
    { effectiveType: "slow-2g" },
    { effectiveType: "2g" },
    { effectiveType: "3g" },
  ])("skips restricted connections: %j", (connection) => {
    rs.stubGlobal("navigator", { connection, onLine: true });
    const loadRouteChunk = rs.fn();
    const cleanup = scheduleRouteCodeWarmup({
      canWarm: () => true,
      onError: rs.fn(),
      router: { loadRouteChunk },
      routes: [createRootRoute()],
    });
    expect(idleCallbacks.size).toBe(0);
    expect(loadRouteChunk).not.toHaveBeenCalled();
    cleanup();
  });

  test("waits for document load and cancels that listener on cleanup", () => {
    rs.spyOn(document, "readyState", "get").mockReturnValue("loading");
    const first = startWarmup();
    expect(idleCallbacks.size).toBe(0);
    first.cleanup();
    window.dispatchEvent(new Event("load"));
    expect(idleCallbacks.size).toBe(0);

    const second = startWarmup();
    window.dispatchEvent(new Event("load"));
    expect(idleCallbacks.size).toBe(1);
    second.cleanup();
  });

  test("skips browsers without idle scheduling instead of forcing a timer", () => {
    rs.stubGlobal("requestIdleCallback", undefined);
    const { cleanup, loadRouteChunk } = startWarmup();
    expect(loadRouteChunk).not.toHaveBeenCalled();
    cleanup();
  });

  test.each(["hidden", "offline", "busy"])(
    "does not schedule while %s",
    (state) => {
      rs.spyOn(document, "visibilityState", "get").mockReturnValue(
        state === "hidden" ? "hidden" : "visible"
      );
      rs.spyOn(navigator, "onLine", "get").mockReturnValue(state !== "offline");
      const { cleanup } = startWarmup(() => state !== "busy");
      expect(idleCallbacks.size).toBe(0);
      cleanup();
    }
  );

  test("rechecks connection restrictions inside the idle callback", () => {
    const { cleanup, loadRouteChunk } = startWarmup();
    rs.stubGlobal("navigator", {
      connection: { saveData: true },
      onLine: true,
    });
    runIdle();
    expect(loadRouteChunk).not.toHaveBeenCalled();
    expect(idleCallbacks.size).toBe(0);
    cleanup();
  });

  test("yields again when the idle budget is exhausted", () => {
    const { cleanup, loadRouteChunk } = startWarmup();
    runIdle(0);
    expect(loadRouteChunk).not.toHaveBeenCalled();
    expect(idleCallbacks.size).toBe(1);
    cleanup();
  });

  test("loads one chunk per idle slot and stops after cleanup during a load", async () => {
    const { cleanup, loadRouteChunk } = startWarmup();
    let finishLoad: (() => void) | undefined;
    loadRouteChunk.mockReturnValue(
      new Promise<void>((resolve) => {
        finishLoad = resolve;
      })
    );
    runIdle();
    expect(loadRouteChunk).toHaveBeenCalledTimes(1);
    expect(idleCallbacks.size).toBe(0);
    cleanup();
    finishLoad?.();
    await rs.waitFor(() => expect(idleCallbacks.size).toBe(0));
  });

  test("schedules the next chunk only after the previous one finishes", async () => {
    const { cleanup, loadRouteChunk } = startWarmup();
    runIdle();
    await rs.waitFor(() => expect(idleCallbacks.size).toBe(1));
    expect(loadRouteChunk).toHaveBeenCalledTimes(1);
    runIdle();
    await rs.waitFor(() => expect(loadRouteChunk).toHaveBeenCalledTimes(2));
    cleanup();
  });

  test("reports chunk failure and stops optional work", async () => {
    const { cleanup, loadRouteChunk, onError } = startWarmup();
    const error = new Error("Chunk unavailable");
    loadRouteChunk.mockRejectedValue(error);
    runIdle();
    await rs.waitFor(() => expect(onError).toHaveBeenCalledWith(error));
    expect(idleCallbacks.size).toBe(0);
    cleanup();
  });
});
