import { describe, expect, test, vi } from "vitest";
import {
  markSetupRequired,
  registerSetupRequiredHandler,
} from "@/stores/setup-required-signal";

const TEST_NUMBER_3 = 3;

// The module uses a module-level variable, so we must isolate tests
// by re-registering (or clearing) the handler in each test.

describe("setup-required-signal", () => {
  test("markSetupRequired does nothing when no handler is registered", () => {
    // Register nothing (or clear by re-importing fresh). Since module state
    // persists across tests in the same worker, we explicitly register
    // undefined-equivalent by passing a no-op we can verify was NOT called.
    // First, ensure no handler leaks in from a previous test by registering
    // a fresh no-op, then calling unregister by registering undefined is not
    // supported. Instead, just call markSetupRequired and confirm it throws
    // no error.
    expect(() => markSetupRequired()).not.toThrow();
  });

  test("registerSetupRequiredHandler registers a handler that is invoked by markSetupRequired", () => {
    const handler = vi.fn();
    registerSetupRequiredHandler(handler);

    markSetupRequired();

    expect(handler).toHaveBeenCalledOnce();
  });

  test("markSetupRequired calls the handler each time it is invoked", () => {
    const handler = vi.fn();
    registerSetupRequiredHandler(handler);

    markSetupRequired();
    markSetupRequired();
    markSetupRequired();

    expect(handler).toHaveBeenCalledTimes(TEST_NUMBER_3);
  });

  test("registering a new handler replaces the previous one", () => {
    const firstHandler = vi.fn();
    const secondHandler = vi.fn();

    registerSetupRequiredHandler(firstHandler);
    registerSetupRequiredHandler(secondHandler);

    markSetupRequired();

    expect(secondHandler).toHaveBeenCalledOnce();
    expect(firstHandler).not.toHaveBeenCalled();
  });
});
