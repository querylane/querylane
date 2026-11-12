import { expect, rs, test } from "@rstest/core";
import { fireEvent, render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { createAgent } from "@ui-sdk/react/agent";
import { useState } from "react";
import { Button } from "@/components/ui/button";
import { DisabledReasonButton } from "@/components/ui/disabled-reason-button";
import { Input } from "@/components/ui/input";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";

const agent = createAgent();
const APPLE_NAME = /Apple/u;

function ControlledInput() {
  const [value, setValue] = useState("");
  return (
    <>
      <Input aria-label="Project name" onValueChange={setValue} value={value} />
      <output aria-label="Current name">{value}</output>
    </>
  );
}

test("ui sdk input updates React state on native input and agent changes", async () => {
  render(<ControlledInput />);
  const input = screen.getByRole("textbox", { name: "Project name" });
  fireEvent.input(input, { target: { value: "Alpha" } });
  expect(screen.getByRole("status", { name: "Current name" }).textContent).toBe(
    "Alpha"
  );
  const result = await agent.act({
    steps: [{ ref: "Project name", action: "setValue", args: ["Beta"] }],
  });
  expect(result.ok).toBe(true);
  expect(screen.getByRole("status", { name: "Current name" }).textContent).toBe(
    "Beta"
  );
});

test("ui sdk button invokes the application action", async () => {
  const handlePress = rs.fn();
  render(
    <Button onClick={handlePress} type="button">
      Apply
    </Button>
  );
  await userEvent.setup().click(screen.getByRole("button", { name: "Apply" }));
  expect(handlePress).toHaveBeenCalledOnce();
});

test("disabled action stays named and keyboard focusable", () => {
  render(
    <DisabledReasonButton disabledReason="Connect first">
      Create instance
    </DisabledReasonButton>
  );
  const button = screen.getByRole("button", { name: "Create instance" });
  expect(button.getAttribute("aria-disabled")).toBe("true");
  expect(button.tabIndex).toBe(0);
});

test("select preserves rich option content", async () => {
  render(
    <Select items={[{ value: "apple", label: "Apple" }]}>
      <SelectTrigger aria-label="Fruit">
        <SelectValue />
      </SelectTrigger>
      <SelectContent>
        <SelectItem label="Apple" value="apple">
          <span>Apple description</span>
        </SelectItem>
      </SelectContent>
    </Select>
  );
  await userEvent
    .setup()
    .click(screen.getByRole("combobox", { name: "Fruit" }));
  expect(
    screen.getByRole("option", { name: APPLE_NAME }).textContent
  ).toContain("Apple description");
});
