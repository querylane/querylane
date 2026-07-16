import { Profiler } from "react";
import { type Column, DataGrid } from "react-data-grid";
import { afterEach, expect, test, vi } from "vitest";
import { page } from "vitest/browser";
import { cleanup, render } from "vitest-browser-react";

import "react-data-grid/lib/styles.css";

interface TestRow {
  id: number;
}

const COLUMNS: Column<TestRow>[] = Array.from({ length: 10 }, (_, index) => ({
  key: `column-${index}`,
  name: `Column ${index}`,
  width: 160,
}));
const ROWS: TestRow[] = [{ id: 1 }];

afterEach(async () => {
  await cleanup();
  vi.unstubAllGlobals();
});

test("coalesces continuous grid resizes", async () => {
  const profilerId = crypto.randomUUID();
  let deliverResize: ((inlineSize: number) => void) | undefined;

  class TestResizeObserver implements ResizeObserver {
    private target: Element | null = null;

    constructor(callback: ResizeObserverCallback) {
      deliverResize = (inlineSize) => {
        if (!this.target) {
          throw new Error("expected an observed grid");
        }
        const size: ResizeObserverSize = { blockSize: 300, inlineSize };
        callback(
          [
            {
              borderBoxSize: [size],
              contentBoxSize: [size],
              contentRect: DOMRect.fromRect({ height: 300, width: inlineSize }),
              devicePixelContentBoxSize: [size],
              target: this.target,
            },
          ],
          this
        );
      };
    }

    disconnect() {
      this.target = null;
    }

    observe(target: Element) {
      this.target = target;
    }

    unobserve(target: Element) {
      if (this.target === target) {
        this.target = null;
      }
    }
  }

  vi.stubGlobal("ResizeObserver", TestResizeObserver);

  let resizeCommitCount = 0;
  render(
    <Profiler
      id={profilerId}
      onRender={() => {
        resizeCommitCount += 1;
      }}
    >
      <div style={{ width: 1000 }}>
        <DataGrid columns={COLUMNS} rows={ROWS} />
      </div>
    </Profiler>
  );

  await expect.element(page.getByRole("grid")).toBeVisible();
  resizeCommitCount = 0;

  if (!deliverResize) {
    throw new Error("expected a resize observer");
  }
  for (let width = 980; width >= 800; width -= 20) {
    deliverResize(width);
  }
  await new Promise((resolve) => setTimeout(resolve, 75));

  expect(resizeCommitCount).toBeLessThanOrEqual(3);
});
