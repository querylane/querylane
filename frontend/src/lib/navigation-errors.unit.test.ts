import { beforeEach, describe, expect, test, vi } from "vitest";
import { logger } from "@/lib/diagnostics";
import {
  handleNavigationError,
  handleNavigationResult,
  isNavigationCancellationError,
} from "@/lib/navigation-errors";

vi.mock("@/lib/diagnostics", () => ({
  logger: {
    debug: vi.fn(),
    error: vi.fn(),
    fatal: vi.fn(),
    fmt: vi.fn(),
    info: vi.fn(),
    trace: vi.fn(),
    warn: vi.fn(),
  },
}));

beforeEach(() => {
  vi.clearAllMocks();
});

describe("handleNavigationError", () => {
  test("logs cancelled navigation promises at debug level", () => {
    handleNavigationError(new Error("navigation cancelled"), {
      area: "home.redirect",
    });

    expect(logger.debug).toHaveBeenCalledWith("Navigation promise rejected", {
      area: "home.redirect",
      errorMessage: "navigation cancelled",
    });
    expect(logger.warn).not.toHaveBeenCalled();
  });

  test("logs non-cancellation route failures at warn level", () => {
    handleNavigationError(new Error("loader failed"), {
      area: "home.redirect",
    });

    expect(logger.warn).toHaveBeenCalledWith("Navigation promise rejected", {
      area: "home.redirect",
      errorMessage: "loader failed",
    });
  });
});

describe("handleNavigationResult", () => {
  test("accepts void navigation results", async () => {
    handleNavigationResult(undefined, { area: "test.void" });
    await Promise.resolve();

    expect(logger.debug).not.toHaveBeenCalled();
    expect(logger.warn).not.toHaveBeenCalled();
  });

  test("logs rejected navigation promises", async () => {
    handleNavigationResult(Promise.reject(new Error("loader failed")), {
      area: "test.reject",
    });
    await Promise.resolve();

    expect(logger.warn).toHaveBeenCalledWith("Navigation promise rejected", {
      area: "test.reject",
      errorMessage: "loader failed",
    });
  });
});

describe("isNavigationCancellationError", () => {
  test.each([
    new Error("cancelled by next navigation"),
    new Error("superseded navigation"),
    new DOMException("aborted", "AbortError"),
  ])("detects cancellation-like errors", (error) => {
    expect(isNavigationCancellationError(error)).toBe(true);
  });

  test("does not treat ordinary route failures as cancellations", () => {
    expect(isNavigationCancellationError(new Error("loader failed"))).toBe(
      false
    );
  });
});
