import { beforeEach, expect, rs, test } from "@rstest/core";
import { act, render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { createAgent } from "@ui-sdk/react/agent";
import { useState } from "react";
import { AgentAccessToggle } from "@/components/agent-access";
import { DataValuePreviewDialog } from "@/components/data-grid/table-data-grid/data-value-preview-dialog";
import { PasswordInput } from "@/components/password-input";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { useAgentDraftStore } from "@/features/agent-drafts/agent-draft-state";
import { requestAgentApproval, useAgentAccessStore } from "./agent-access";

const agent = createAgent({
  allow: (action, { signal }) => requestAgentApproval(action, signal),
});
const rename = {
  steps: [
    { ref: "Connection display name", action: "setValue", args: ["New name"] },
  ],
};

function ConnectionName() {
  const [value, setValue] = useState("Original name");
  return (
    <Input
      aria-label="Connection display name"
      onValueChange={setValue}
      value={value}
    />
  );
}

beforeEach(() => {
  useAgentAccessStore.getState().setEnabled(false);
});

test("agent access defaults to off and an agent cannot enable it", async () => {
  render(
    <>
      <AgentAccessToggle />
      <ConnectionName />
    </>
  );
  const result = await agent.act(rename);
  expect(result.ok).toBe(false);
  expect(useAgentAccessStore.getState().enabled).toBe(false);
  expect(
    agent
      .snapshot()
      .some((entry) => entry.label?.includes("Enable agent access") === true)
  ).toBe(false);
});

test("a change waits for approval and updates application state only after approval", async () => {
  useAgentAccessStore.getState().setEnabled(true);
  render(<ConnectionName />);
  const pending = agent.act(rename);
  await waitFor(() => {
    expect(useAgentAccessStore.getState().approval).not.toBeNull();
  });
  expect(screen.getByRole("textbox").getAttribute("value")).toBe(
    "Original name"
  );
  await act(async () => {
    useAgentAccessStore.getState().approval?.decide(true);
    const result = await pending;
    expect(result.ok).toBe(true);
  });
  expect(screen.getByRole("textbox").getAttribute("value")).toBe("New name");
});

test("disabling access cancels pending approval without applying it", async () => {
  useAgentAccessStore.getState().setEnabled(true);
  render(<ConnectionName />);
  const pending = agent.act(rename);
  await waitFor(() => {
    expect(useAgentAccessStore.getState().approval).not.toBeNull();
  });
  useAgentAccessStore.getState().setEnabled(false);
  const result = await pending;
  expect(result.ok).toBe(false);
  expect(screen.getByRole("textbox").getAttribute("value")).toBe(
    "Original name"
  );
});

test("secret values stay redacted when visible and query results are absent", async () => {
  const { unmount } = render(
    <>
      <PasswordInput aria-label="Server password" value="private-secret" />
      <section data-agent-hidden={true}>
        <Input aria-label="Query results" readOnly={true} value="private-row" />
      </section>
    </>
  );
  await userEvent
    .setup()
    .click(screen.getByRole("button", { name: "Show password" }));
  expect(screen.getByLabelText("Server password").getAttribute("type")).toBe(
    "text"
  );
  const snapshot = JSON.stringify(agent.snapshot());
  expect(snapshot).toContain("[redacted]");
  expect(snapshot).not.toContain("private-secret");
  expect(snapshot).not.toContain("private-row");
  expect(snapshot).not.toContain("Query results");
  unmount();
  expect(JSON.stringify(agent.snapshot())).not.toContain("private-secret");
  expect(JSON.stringify(agent.snapshot())).not.toContain("private-row");
});

test("destructive actions never execute through the bridge", async () => {
  useAgentAccessStore.getState().setEnabled(true);
  const handleDelete = rs.fn();
  render(
    <Button onClick={handleDelete} type="button" variant="destructive">
      Delete database forever
    </Button>
  );
  const result = await agent.act({
    steps: [{ ref: "Delete database forever", action: "press" }],
  });
  expect(result.ok).toBe(false);
  expect(handleDelete).not.toHaveBeenCalled();
  expect(useAgentAccessStore.getState().approval).toBeNull();
});

test("a stale approval cannot clear a later action's approval", async () => {
  useAgentAccessStore.getState().setEnabled(true);
  const action = {
    ref: "name",
    component: "input",
    action: "setValue",
    args: ["New name"],
  };
  const firstRequest = requestAgentApproval(
    action,
    new AbortController().signal
  );
  const first = useAgentAccessStore.getState().approval;
  if (!first) {
    throw new Error("Expected the first approval");
  }
  first.decide(false);
  expect(await firstRequest).toBe(false);
  const nextRequest = requestAgentApproval(
    action,
    new AbortController().signal
  );
  const next = useAgentAccessStore.getState().approval;
  if (!next) {
    throw new Error("Expected the next approval");
  }
  first.decide(true);
  expect(useAgentAccessStore.getState().approval).toBe(next);
  next.decide(false);
  expect(await nextRequest).toBe(false);
});

test("full-value result dialogs stay outside the agent snapshot", async () => {
  render(
    <DataValuePreviewDialog
      columnName="private_notes"
      format="text"
      isTruncated={false}
      onOpenChange={() => undefined}
      open={true}
      raw="private-result"
      rawType="text"
    >
      private-result
    </DataValuePreviewDialog>
  );
  await screen.findByRole("dialog", { name: "private_notes text" });
  const snapshot = JSON.stringify(agent.snapshot());
  expect(snapshot).not.toContain("private_notes");
  expect(snapshot).not.toContain("private-result");
  expect(snapshot).not.toContain("Copy text");
});

test("aborting permission clears the prompt and cannot apply a late approval", async () => {
  useAgentAccessStore.getState().setEnabled(true);
  const controller = new AbortController();
  const result = requestAgentApproval(
    {
      ref: "name",
      component: "input",
      action: "setValue",
      args: ["Cancelled"],
    },
    controller.signal
  );
  const { approval } = useAgentAccessStore.getState();
  if (!approval) {
    throw new Error("Expected pending approval");
  }
  controller.abort();
  expect(await result).toBe(false);
  expect(useAgentAccessStore.getState().approval).toBeNull();
  approval.decide(true);
  expect(useAgentAccessStore.getState().approval).toBeNull();
});

test("an approval cannot follow the agent onto another route", async () => {
  useAgentAccessStore.getState().setEnabled(true);
  const location = globalThis.location.href;
  try {
    const result = requestAgentApproval(
      { ref: "name", component: "input", action: "setValue", args: ["Stale"] },
      new AbortController().signal
    );
    globalThis.history.replaceState(null, "", "/another-instance");
    useAgentAccessStore.getState().approval?.decide(true);
    expect(await result).toBe(false);
    expect(useAgentAccessStore.getState().approval).toBeNull();
  } finally {
    globalThis.history.replaceState(null, "", location);
  }
});

test("a draft value guard is rechecked after the person approves", async () => {
  useAgentAccessStore.getState().setEnabled(true);
  let current = "Preview";
  useAgentDraftStore.setState({ approvalGuard: () => current === "Preview" });
  const result = requestAgentApproval(
    {
      ref: "draft",
      component: "instance-draft",
      action: "setDisplayName",
      args: ["Before"],
    },
    new AbortController().signal
  );
  expect(useAgentAccessStore.getState().approval).not.toBeNull();
  current = "Later human edit";
  useAgentAccessStore.getState().approval?.decide(true);
  expect(await result).toBe(false);
  expect(useAgentAccessStore.getState().approval).toBeNull();
});

test("a stale draft operation is refused before showing a permission prompt", async () => {
  useAgentAccessStore.getState().setEnabled(true);
  useAgentDraftStore.setState({ approvalGuard: () => false });
  await expect(
    requestAgentApproval(
      {
        ref: "draft",
        component: "instance-draft",
        action: "setSslMode",
        args: ["require"],
      },
      new AbortController().signal
    )
  ).resolves.toBe(false);
  expect(useAgentAccessStore.getState().approval).toBeNull();
});
