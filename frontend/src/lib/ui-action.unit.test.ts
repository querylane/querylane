import { describe, expect, rs, test } from "@rstest/core";
import { waitFor } from "@testing-library/react";
import { handleAsyncAction } from "@/lib/ui-action";

const mocks = rs.hoisted(() => ({
  capture: rs.fn<(error: unknown) => void>(),
  toast: rs.fn<(title: string, options: { description: string }) => void>(),
}));

rs.mock("@/lib/diagnostics", () => ({ captureException: mocks.capture }));
rs.mock("sonner", () => ({ toast: { error: mocks.toast } }));

describe("handleAsyncAction", () => {
  test("allows an action to return early without creating a promise", () => {
    handleAsyncAction(() => undefined)();
    expect(mocks.toast).not.toHaveBeenCalled();
    expect(mocks.capture).not.toHaveBeenCalled();
  });
  test("preserves arguments and exposes a synchronous event-handler contract", async () => {
    const action = rs.fn((value: string) => Promise.resolve(value));
    const handler = rs.fn(handleAsyncAction(action));
    handler("query");
    expect(handler).toHaveReturnedWith(undefined);
    await waitFor(() => {
      expect(action).toHaveBeenCalledWith("query");
    });
  });

  test("reports rejected actions visibly instead of losing their promises", async () => {
    const error = new Error("Refresh failed");
    handleAsyncAction(() => Promise.reject(error))();
    await waitFor(() => {
      expect(mocks.capture).toHaveBeenCalledWith(error);
      expect(mocks.toast).toHaveBeenCalledWith(
        expect.any(String),
        expect.objectContaining({
          description: expect.stringContaining("Refresh failed") as unknown,
        })
      );
    });
  });

  test("reports synchronous failures through the same boundary", () => {
    const error = new Error("Action failed before starting");
    handleAsyncAction((): Promise<unknown> => {
      throw error;
    })();
    expect(mocks.capture).toHaveBeenCalledWith(error);
    expect(mocks.toast).toHaveBeenCalled();
  });
});
