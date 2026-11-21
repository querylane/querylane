import { expect, rs, test } from "@rstest/core";
import { withSource } from "@ui-sdk/core/observe";
import { checkServer, partAttrs } from "@ui-sdk/core/testing";
import { draftRevisions } from "./draft-revisions";
import {
  agentDraftChangeError,
  type InstanceDraftValue,
  instanceDraft,
} from "./instance-draft";

const original: InstanceDraftValue = {
  displayName: "Production",
  labels: [{ id: "environment", key: "env", value: "production" }],
  sslMode: "verify-full",
  sslNegotiation: "postgres",
};

test("draft primitives render deterministic server HTML without browser or random reads", () => {
  const html = checkServer(
    instanceDraft,
    original,
    '<root aria-label="Instance draft">Draft activity</root>'
  );
  expect(html).toContain('role="group"');
  expect(html).toContain("data-querylane-agent-draft");
  const revisions = checkServer(
    draftRevisions,
    { defaultValue: "0" },
    '<root aria-label="Draft revision"><revision value="0">Start</revision><revision value="1">Agent change</revision></root>'
  );
  expect(revisions).toContain('role="radiogroup"');
  expect(revisions).toContain('aria-checked="true"');
});

test("core change callbacks can cancel an agent draft without changing the controlled owner", () => {
  let requested = "";
  const draft = instanceDraft({
    id: "draft",
    ...original,
    onDisplayNameChange(value, details) {
      if (details.source === "agent" && !value.trim()) {
        details.cancel();
      } else {
        requested = value;
      }
    },
  });
  try {
    expect(withSource("agent", () => draft.api.setDisplayName(""))).toBe(false);
    expect(requested).toBe("");
    expect(draft.get().displayName).toBe("Production");
    expect(
      withSource("agent", () => draft.api.setDisplayName("Read replica"))
    ).toBe(true);
    expect(requested).toBe("Read replica");
    expect(Object.keys(draft.api)).toEqual([
      "setDisplayName",
      "setLabels",
      "setSslMode",
      "setSslNegotiation",
    ]);
  } finally {
    draft.destroy();
  }
});

test("malformed labels and non-text inputs never enter draft state", () => {
  const changed = rs.fn();
  const draft = instanceDraft({
    id: "draft",
    ...original,
    onLabelsChange: changed,
  });
  try {
    expect(() =>
      draft.api.setLabels([
        { id: "a", key: "env", value: "prod" },
        { id: "a", key: "other", value: "x" },
      ])
    ).toThrow("unique ids");
    expect(() => draft.api.setDisplayName({ password: "private" })).toThrow(
      "strings"
    );
    expect(changed).not.toHaveBeenCalled();
    expect(draft.get().labels).toEqual(original.labels);
    expect(partAttrs(draft.part("root", {}))).toMatchObject({ role: "group" });
  } finally {
    draft.destroy();
  }
});

test("agent-only validation rejects incomplete values and incompatible TLS without blocking human drafts", () => {
  expect(agentDraftChangeError(original, "displayName", "")).toContain(
    "cannot be empty"
  );
  expect(
    agentDraftChangeError(original, "labels", [
      { id: "x", key: "", value: "draft" },
    ])
  ).toContain("non-empty");
  expect(
    agentDraftChangeError(
      { ...original, sslMode: "prefer" },
      "sslNegotiation",
      "direct"
    )
  ).toContain("require or stronger");
  expect(
    agentDraftChangeError(original, "sslNegotiation", "direct")
  ).toBeNull();
  const draft = instanceDraft({ id: "readonly", ...original, disabled: true });
  try {
    expect(draft.api.setDisplayName("Wrong")).toBe(false);
  } finally {
    draft.destroy();
  }
});
