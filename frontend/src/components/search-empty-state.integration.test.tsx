import { cleanup, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, test } from "vitest";
import { SearchEmptyState } from "@/components/search-empty-state";

afterEach(() => cleanup());

describe("SearchEmptyState", () => {
  test("renders a search icon for filtered empty states", () => {
    render(<SearchEmptyState resourceName="roles" />);

    const title = screen.getByText("No roles found");
    const panel = title.closest('[data-slot="search-empty-state"]');

    expect(panel?.querySelector('[data-slot="empty-icon"] svg')).toBeTruthy();
  });
});
