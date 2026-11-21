import { expect, rs, test } from "@rstest/core";
import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { Button } from "@/components/ui/button";
import { BashSyntaxHighlight } from "./bash-syntax-highlight";
import { SqlCodeBlock } from "./sql-code-block";

const { sqlLoads, bashLoads } = rs.hoisted(() => ({
  sqlLoads: rs.fn(),
  bashLoads: rs.fn(),
}));

rs.mock("./sql-syntax-highlight-content", () => {
  sqlLoads();
  throw new Error("SQL enhancement import rejected");
});
rs.mock("./bash-syntax-highlight-content", () => {
  bashLoads();
  throw new Error("Bash enhancement import rejected");
});

test("oversized SQL and Bash skip enhancement imports and SQL copies exactly", async () => {
  const user = userEvent.setup();
  const writeText = rs
    .spyOn(navigator.clipboard, "writeText")
    .mockResolvedValue();
  const source = `\t${"🙂".repeat(32_768)}\r\n`;
  const { container } = render(
    <>
      <SqlCodeBlock sql={source} />
      <pre>
        <BashSyntaxHighlight code={source} />
      </pre>
    </>
  );
  await user.click(screen.getByRole("button", { name: "Copy SQL" }));
  expect(writeText).toHaveBeenLastCalledWith(source);
  expect(
    [...container.querySelectorAll("code")].map((code) => code.textContent)
  ).toEqual([source, source]);
  expect(sqlLoads).not.toHaveBeenCalled();
  expect(bashLoads).not.toHaveBeenCalled();
  expect(screen.queryByRole("status")).toBeNull();
});

test("SQL enhancement rejection leaves exact, copyable source and survives source changes", async () => {
  const user = userEvent.setup();
  const writeText = rs
    .spyOn(navigator.clipboard, "writeText")
    .mockResolvedValue();
  const source = "\tSELECT '🙂';  \r\n\n";
  const { container, rerender } = render(<SqlCodeBlock sql={source} />);
  await waitFor(() => {
    expect(screen.getByRole("status").textContent).toBe(
      "Syntax highlighting unavailable. Showing plain text."
    );
  });
  expect(container.querySelector("code")?.textContent).toBe(source);
  await user.click(screen.getByRole("button", { name: "Copy SQL" }));
  expect(writeText).toHaveBeenLastCalledWith(source);
  const changed = `${source}-- updated\n`;
  rerender(<SqlCodeBlock sql={changed} />);
  expect(container.querySelector("code")?.textContent).toBe(changed);
  await user.click(screen.getByRole("button", { name: "Copied" }));
  expect(writeText).toHaveBeenLastCalledWith(changed);
  expect(sqlLoads).toHaveBeenCalledTimes(1);
});

test("bash enhancement rejection leaves exact source and surrounding controls usable", async () => {
  const user = userEvent.setup();
  const onClick = rs.fn();
  const source = "\tprintf '🙂'  \r\n\n";
  const { container } = render(
    <>
      <pre>
        <BashSyntaxHighlight code={source} />
      </pre>
      <Button onClick={onClick}>Continue</Button>
    </>
  );
  await waitFor(() => {
    expect(screen.getByRole("status").textContent).toBe(
      "Syntax highlighting unavailable. Showing plain text."
    );
  });
  expect(container.querySelector("code")?.textContent).toBe(source);
  await user.click(screen.getByRole("button", { name: "Continue" }));
  expect(onClick).toHaveBeenCalledTimes(1);
});
