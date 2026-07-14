import { cleanup, render, screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, describe, expect, it, vi } from "vitest";
import { PaginationFooter } from "@/components/data-grid/table-data-grid/pagination-footer";

afterEach(() => cleanup());

describe("PaginationFooter", () => {
  it("groups resource-specific page sizes with navigation", async () => {
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

    const pageLabel = screen.getByText("Page 1 of 2");
    const footer = pageLabel.closest('[data-slot="pagination-footer"]');
    if (!(footer instanceof HTMLElement)) {
      throw new Error("Missing shared pagination footer");
    }
    expect(
      within(footer).getByRole("button", { name: "Previous page" })
    ).toBeTruthy();
    expect(
      within(footer).getByRole("button", { name: "Next page" })
    ).toBeTruthy();

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

  it("uses the standard page sizes by default", async () => {
    const user = userEvent.setup();

    render(
      <PaginationFooter
        hasNext={false}
        hasPrev={false}
        onNext={vi.fn()}
        onPageSizeChange={vi.fn()}
        onPrev={vi.fn()}
        pageLabel="Page 1 of 1"
        pageSize={10}
      />
    );

    await user.click(screen.getByRole("combobox", { name: "Rows per page" }));

    expect(
      screen.getAllByRole("option").map((option) => option.textContent)
    ).toEqual(["10", "25", "50"]);
  });
});
