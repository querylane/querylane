import { afterEach, describe, expect, it, vi } from "vitest";

import {
  isChunkLoadError,
  reloadChunkLoadErrorOnce,
  reserveChunkLoadReloadAttempt,
} from "@/lib/chunk-load-recovery";

const RSPACK_CHUNK_ERROR = new Error(
  "Loading chunk 9818 failed.\n(missing: https://demo.querylane.net/static/js/async/9818.55e76f5dd2.js)"
);
const NATIVE_DYNAMIC_IMPORT_ERROR = new Error(
  "Failed to fetch dynamically imported module: https://demo.querylane.net/static/js/async/9818.55e76f5dd2.js"
);

describe("chunk load recovery", () => {
  afterEach(() => {
    window.sessionStorage.clear();
  });

  it("recognizes TanStack native dynamic import failures and Rspack chunk failures", () => {
    expect(isChunkLoadError(NATIVE_DYNAMIC_IMPORT_ERROR)).toBe(true);
    expect(isChunkLoadError(RSPACK_CHUNK_ERROR)).toBe(true);
    expect(isChunkLoadError(new Error("database connection failed"))).toBe(
      false
    );
  });

  it("reserves one automatic reload per missing module message", () => {
    expect(
      reserveChunkLoadReloadAttempt({
        error: RSPACK_CHUNK_ERROR,
        storage: window.sessionStorage,
      })
    ).toBe(true);
    expect(
      reserveChunkLoadReloadAttempt({
        error: RSPACK_CHUNK_ERROR,
        storage: window.sessionStorage,
      })
    ).toBe(false);
    expect(
      reserveChunkLoadReloadAttempt({
        error: NATIVE_DYNAMIC_IMPORT_ERROR,
        storage: window.sessionStorage,
      })
    ).toBe(true);
  });

  it("reloads once and then returns false so callers can render loop-safe copy", () => {
    const reloadPage = vi.fn();

    expect(
      reloadChunkLoadErrorOnce({
        error: RSPACK_CHUNK_ERROR,
        reloadPage,
        storage: window.sessionStorage,
      })
    ).toBe(true);
    expect(reloadPage).toHaveBeenCalledTimes(1);
    expect(
      reloadChunkLoadErrorOnce({
        error: RSPACK_CHUNK_ERROR,
        reloadPage,
        storage: window.sessionStorage,
      })
    ).toBe(false);
    expect(reloadPage).toHaveBeenCalledTimes(1);
  });
});
