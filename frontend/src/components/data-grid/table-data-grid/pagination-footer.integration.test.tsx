import { cleanup, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { PaginationFooter } from "@/components/data-grid/table-data-grid/pagination-footer";

afterEach(() => cleanup());

describe("PaginationFooter", () => {
  it("uses a stable rows-per-page select label", () => {
    const props = {
      hasNext: true,
      hasPrev: false,
      onNext: vi.fn(),
      onPageSizeChange: vi.fn(),
      onPrev: vi.fn(),
      pageIndex: 0,
      pageLabel: "Page 1 of 4",
      pageSize: 25,
    };
    const { rerender } = render(<PaginationFooter {...props} />);

    expect(
      screen.getByRole("combobox", { name: "Rows per page" })
    ).toBeTruthy();

    rerender(<PaginationFooter {...props} pageSize={100} />);

    expect(
      screen.getByRole("combobox", { name: "Rows per page" })
    ).toBeTruthy();
    expect(
      screen.queryByRole("combobox", { name: "Rows per page: 100" })
    ).toBeNull();
  });
});
