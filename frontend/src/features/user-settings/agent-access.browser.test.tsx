import { page } from "@rstest/browser";
import { expect, rs, test } from "@rstest/core";
import { createAgent } from "@ui-sdk/react/agent";
import { useState } from "react";
import { render } from "@/__tests__/render-ui";
import {
  AgentAccessIntegration,
  AgentAccessToggle,
} from "@/components/agent-access";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { isRecord } from "@/lib/value-guards";
import { requestAgentApproval, useAgentAccessStore } from "./agent-access";

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

function DialogConnectionName() {
  const [name, setName] = useState("Original");
  return (
    <>
      <AgentAccessIntegration />
      <Dialog>
        <DialogTrigger render={<Button type="button">Edit draft</Button>} />
        <DialogContent>
          <DialogTitle>Connection draft</DialogTitle>
          <Input
            aria-label="Draft connection name"
            onValueChange={setName}
            value={name}
          />
        </DialogContent>
      </Dialog>
    </>
  );
}

test("agent approval over an open dialog stays usable and restores its focus", async () => {
  const agent = createAgent({
    allow: (action, { signal }) => requestAgentApproval(action, signal),
  });
  useAgentAccessStore.getState().setEnabled(true);
  const mounted = await render(<DialogConnectionName />);
  try {
    await page.getByRole("button", { name: "Edit draft" }).click();
    const input = page.getByRole("textbox", { name: "Draft connection name" });
    await input.focus();
    const result = agent.act({
      steps: [
        {
          ref: "Draft connection name",
          action: "setValue",
          args: ["Approved draft"],
        },
      ],
    });
    const approval = page.getByRole("dialog", {
      name: "Approve one agent action?",
    });
    await expect.element(approval).toBeVisible();
    await expect
      .element(page.getByRole("button", { name: "Deny action" }))
      .toBeFocused();
    await expect.element(input).toHaveValue("Original");
    await page.getByRole("button", { name: "Approve action" }).click();
    await expect(result).resolves.toMatchObject({ ok: true });
    await expect.element(approval).toBeDetached();
    await expect
      .element(page.getByRole("dialog", { name: "Connection draft" }))
      .toBeVisible();
    await expect.element(input).toHaveValue("Approved draft");
    await expect.element(input).toBeFocused();
  } finally {
    await mounted.unmount();
    useAgentAccessStore.getState().setEnabled(false);
  }
});
