import { expect, test } from "@rstest/core";
import { fireEvent, render, screen } from "@testing-library/react";
import { useState } from "react";
import { Input } from "@/components/ui/input";
import { useAgentAccessStore } from "@/features/user-settings/agent-access";
import { useAgentDraftStore } from "./agent-draft-state";
import { initializeUiObservation } from "./ui-observation";

function ObservationFields() {
  const [name, setName] = useState("");
  const [secret, setSecret] = useState("");
  const [rows, setRows] = useState("");
  return (
    <>
      <Input aria-label="Visible draft" onValueChange={setName} value={name} />
      <Input
        aria-label="Server secret"
        data-agent-secret={true}
        onValueChange={setSecret}
        value={secret}
      />
      <section data-agent-hidden={true}>
        <Input aria-label="Hidden SQL" onValueChange={setRows} value={rows} />
      </section>
    </>
  );
}

test("page observation is opt-in, provenance-only, and never retains secrets or hidden data", () => {
  useAgentAccessStore.getState().setEnabled(false);
  const stop = initializeUiObservation();
  const mounted = render(<ObservationFields />);
  try {
    fireEvent.input(screen.getByLabelText("Visible draft"), {
      target: { value: "before opt-in" },
    });
    expect(useAgentDraftStore.getState().activity).toEqual([]);
    useAgentAccessStore.getState().setEnabled(true);
    fireEvent.input(screen.getByLabelText("Visible draft"), {
      target: { value: "public field value" },
    });
    fireEvent.input(screen.getByLabelText("Server secret"), {
      target: { value: "credential-must-not-survive" },
    });
    fireEvent.input(screen.getByLabelText("Hidden SQL"), {
      target: { value: "select private_row" },
    });
    const { activity } = useAgentDraftStore.getState();
    expect(activity.some((entry) => entry.label === "Visible draft")).toBe(
      true
    );
    const recorded = JSON.stringify(activity);
    expect(recorded).not.toContain("public field value");
    expect(recorded).not.toContain("credential-must-not-survive");
    expect(recorded).not.toContain("private_row");
    expect(recorded).not.toContain("Hidden SQL");
    expect(recorded).not.toContain("Server secret");
    useAgentAccessStore.getState().setEnabled(false);
    expect(useAgentDraftStore.getState().activity).toEqual([]);
    stop();
    useAgentAccessStore.getState().setEnabled(true);
    fireEvent.input(screen.getByLabelText("Visible draft"), {
      target: { value: "after cleanup" },
    });
    expect(useAgentDraftStore.getState().activity).toEqual([]);
  } finally {
    stop();
    mounted.unmount();
    useAgentAccessStore.getState().setEnabled(false);
  }
});
