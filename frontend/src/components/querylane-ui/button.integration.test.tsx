import { expect, test } from "@rstest/core";
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { Button } from "./button";

test("owned button presentations preserve registry variants and interaction", async () => {
  const user = userEvent.setup();
  let clicks = 0;
  render(
    <Button
      className="mt-4"
      onClick={() => {
        clicks += 1;
      }}
      presentation="quiet"
      size="sm"
      variant="ghost"
    >
      Open
    </Button>
  );
  const button = screen.getByRole("button", { name: "Open" });
  for (const token of [
    "text-muted-foreground",
    "hover:text-foreground",
    "h-8",
    "mt-4",
  ]) {
    expect(button.classList.contains(token)).toBe(true);
  }
  await user.click(button);
  expect(clicks).toBe(1);
  expect(button.hasAttribute("presentation")).toBe(false);
});
