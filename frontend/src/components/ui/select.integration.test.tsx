import { cleanup, render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, describe, expect, it, vi } from "vitest";

import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";

afterEach(() => cleanup());

describe("Select", () => {
  it("makes options inherit the root disabled state", async () => {
    const user = userEvent.setup();
    const onValueChange = vi.fn();

    render(
      <Select
        defaultValue="first"
        disabled={true}
        onValueChange={onValueChange}
        open={true}
      >
        <SelectTrigger aria-label="Example option">
          <SelectValue />
        </SelectTrigger>
        <SelectContent>
          <SelectItem value="first">First</SelectItem>
          <SelectItem value="second">Second</SelectItem>
        </SelectContent>
      </Select>
    );

    const secondOption = await screen.findByRole("option", { name: "Second" });

    expect(secondOption.getAttribute("aria-disabled")).toBe("true");
    await user.click(secondOption);
    expect(onValueChange).not.toHaveBeenCalled();
  });
});
