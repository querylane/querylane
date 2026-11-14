import { expect, rs, test } from "@rstest/core";
import { act, render, waitFor } from "@testing-library/react";
import { withSource } from "@ui-sdk/core/observe";
import { usePart, usePrimitive } from "@ui-sdk/react/primitive";
import { useEffect, useState } from "react";
import { Button } from "@/components/ui/button";
import { useAgentAccessStore } from "@/features/user-settings/agent-access";
import { agent } from "@/features/user-settings/agent-tools";
import { createAgentDraftSession } from "./agent-draft-session";
import { instanceDraft } from "./instance-draft";

const CONTROLS_BEFORE_DRAFT = 101;

function LargePage({
  onReady,
}: {
  onReady: (draft: ReturnType<typeof instanceDraft>) => void;
}) {
  const [displayName, setDisplayName] = useState("Original");
  const draft = usePrimitive(instanceDraft, {
    displayName,
    labels: [],
    sslMode: "prefer",
    sslNegotiation: "postgres",
    onDisplayNameChange: setDisplayName,
  });
  const { instance } = draft;
  useEffect(
    function reportCommittedDraft() {
      onReady(instance);
    },
    [instance, onReady]
  );
  const marker = usePart(
    draft,
    "root",
    {},
    { "aria-label": "Instance draft", children: "Draft activity" },
    "div"
  );
  return (
    <>
      {Array.from({ length: CONTROLS_BEFORE_DRAFT }, (_, index) => (
        <Button disabled={true} key={String(index)}>
          Other control {index}
        </Button>
      ))}
      {marker}
    </>
  );
}

test("draft undo works beyond the agent's capped page snapshot", async () => {
  const ready = rs.fn<(draft: ReturnType<typeof instanceDraft>) => void>();
  const page = render(<LargePage onReady={ready} />);
  const draft = ready.mock.calls[0]?.[0];
  if (!draft) {
    throw new Error("Expected a committed draft");
  }
  const anchor = page.getByRole("group", { name: "Instance draft" });
  const publish = rs.fn();
  useAgentAccessStore.getState().setEnabled(true);
  const session = createAgentDraftSession(anchor, () => draft.get(), publish);
  try {
    expect(
      agent.snapshot().some((component) => component.component === "more")
    ).toBe(true);
    expect(
      agent
        .snapshot()
        .some((component) => component.component === "instance-draft")
    ).toBe(false);
    act(() => {
      withSource("agent", () => draft.api.setDisplayName("Agent draft"));
    });
    expect(draft.get().displayName).toBe("Agent draft");
    const undo = session.undoAgent();
    await waitFor(() => {
      expect(useAgentAccessStore.getState().approval).not.toBeNull();
    });
    await act(async () => {
      useAgentAccessStore.getState().approval?.decide(true);
      await undo;
    });
    expect(draft.get().displayName).toBe("Original");
  } finally {
    session.destroy();
    page.unmount();
    useAgentAccessStore.getState().setEnabled(false);
  }
});
