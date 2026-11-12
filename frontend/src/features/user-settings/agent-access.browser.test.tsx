import { page } from "@rstest/browser";
import { expect, rs, test } from "@rstest/core";
import { useState } from "react";
import { render } from "@/__tests__/render-ui";
import {
  AgentAccessIntegration,
  AgentAccessToggle,
} from "@/components/agent-access";
import { Input } from "@/components/ui/input";
import { isRecord } from "@/lib/value-guards";
import { useAgentAccessStore } from "./agent-access";

function isActTool(
  tool: unknown
): tool is { name: "act"; execute: (input: unknown) => unknown } {
  return (
    isRecord(tool) &&
    tool["name"] === "act" &&
    typeof tool["execute"] === "function"
  );
}

function AgentAccessFixture() {
  const [name, setName] = useState("Original");
  return (
    <>
      <AgentAccessToggle />
      <AgentAccessIntegration />
      <Input
        aria-label="Connection name"
        onValueChange={setName}
        value={name}
      />
    </>
  );
}

test("a person opts in, approves one change, and revokes WebMCP access", async () => {
  const previous = Object.getOwnPropertyDescriptor(document, "modelContext");
  const unregisterTool = rs.fn<() => void>();
  const registerTool = rs.fn<
    (tool: unknown, options: { signal: AbortSignal }) => Promise<void>
  >((_tool, { signal }) => {
    signal.addEventListener(
      "abort",
      () => {
        unregisterTool();
      },
      { once: true }
    );
    return Promise.resolve();
  });
  Object.defineProperty(document, "modelContext", {
    configurable: true,
    value: { registerTool, unregisterTool },
  });
  useAgentAccessStore.getState().setEnabled(false);
  const mounted = await render(<AgentAccessFixture />);
  try {
    expect(registerTool).not.toHaveBeenCalled();
    await page
      .getByRole("button", { name: "Enable agent access for this tab" })
      .click();
    expect(useAgentAccessStore.getState().enabled).toBe(true);
    await expect.poll(() => registerTool.mock.calls.length).toBe(3);
    const actTool = registerTool.mock.calls
      .map(([tool]) => tool)
      .find((tool) => isActTool(tool));
    if (!actTool) {
      throw new Error("Expected the registered WebMCP act tool");
    }
    const result = actTool.execute({
      steps: [
        { ref: "Connection name", action: "setValue", args: ["Approved"] },
      ],
    });
    await expect
      .element(page.getByRole("dialog", { name: "Approve one agent action?" }))
      .toBeVisible();
    await expect
      .element(page.getByRole("textbox", { name: "Connection name" }))
      .toHaveValue("Original");
    await page.getByRole("button", { name: "Approve action" }).click();
    const outcome = await result;
    expect(isRecord(outcome) && outcome["ok"] === true).toBe(true);
    await expect
      .element(page.getByRole("textbox", { name: "Connection name" }))
      .toHaveValue("Approved");
    await expect
      .element(page.getByRole("dialog", { name: "Approve one agent action?" }))
      .toBeDetached();
    await page.getByRole("button", { name: "Disable agent access" }).click();
    expect(useAgentAccessStore.getState().enabled).toBe(false);
    await expect.poll(() => unregisterTool.mock.calls.length).toBe(3);
    expect(useAgentAccessStore.getState().approval).toBeNull();
  } finally {
    await mounted.unmount();
    useAgentAccessStore.getState().setEnabled(false);
    if (previous) {
      Object.defineProperty(document, "modelContext", previous);
    } else {
      Reflect.deleteProperty(document, "modelContext");
    }
  }
});
