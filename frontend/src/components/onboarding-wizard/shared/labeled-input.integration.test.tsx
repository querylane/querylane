import { afterEach, expect, test } from "@rstest/core";
import { cleanup, render, screen } from "@testing-library/react";
import { LabeledInput } from "./labeled-input";

afterEach(cleanup);

test("connects the label and error when the caller omits an input id", () => {
  render(<LabeledInput error="Required" label="Database name" />);
  const input = screen.getByRole("textbox", { name: "Database name" });
  expect(input.id).not.toBe("");
  expect(input.getAttribute("aria-describedby")).toBe(
    screen.getByText("Required").id
  );
});
