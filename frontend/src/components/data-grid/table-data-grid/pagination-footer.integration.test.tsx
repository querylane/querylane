import { cleanup, render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, describe, expect, it, vi } from "vitest";
import { PaginationFooter } from "@/components/data-grid/table-data-grid/pagination-footer";

afterEach(() => cleanup());

describe("PaginationFooter", () => {
  it("supports resource-specific page sizes", async () => {
    const user = userEvent.setup();
    const onPageSizeChange = vi.fn();

    render(
      <PaginationFooter
        hasNext={true}
        hasPrev={false}
        onNext={vi.fn()}
        onPageSizeChange={onPageSizeChange}
        onPrev={vi.fn()}
        pageLabel="Page 1 of 2"
        pageSize={10}
        pageSizeLabel="Triggers per page"
        pageSizeOptions={[10, 25, 50]}
      />
    );

    await user.click(
      screen.getByRole("combobox", { name: "Triggers per page" })
    );
    expect(
      screen.getAllByRole("option").map((option) => option.textContent)
    ).toEqual(["10", "25", "50"]);
    await user.click(screen.getByRole("option", { name: "25" }));
    expect(onPageSizeChange).toHaveBeenCalledWith(25);
  });

  it("uses a stable rows-per-page select label", () => {
    const props = {
      hasNext: true,
      hasPrev: false,
      onNext: vi.fn(),
      onPageSizeChange: vi.fn(),
      onPrev: vi.fn(),
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
