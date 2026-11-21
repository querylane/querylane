import { expect, test } from "@rstest/core";
import { act, fireEvent, render, screen } from "@testing-library/react";
import { observe } from "@ui-sdk/core/observe";
import { createAgent } from "@ui-sdk/react/agent";
import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { Dialog, DialogContent, DialogTitle } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { useAgentAccessStore } from "@/features/user-settings/agent-access";
import { baseUiState } from "./base-ui-dom";

const agent = createAgent({ allow: () => true });

function ControlledInput({ refuse = false }: { refuse?: boolean }) {
  const [value, setValue] = useState("Human draft");
  return (
    <Input
      aria-label="Adapter display name"
      onValueChange={(next, details) => {
        if (refuse) {
          details.cancel();
        } else {
          setValue(next);
        }
      }}
      value={value}
    />
  );
}

test("base UI inputs remain discoverable and agent edits use their real callbacks", async () => {
  render(<ControlledInput />);
  expect(await agent.query({ text: "Adapter display name" })).toEqual(
    expect.arrayContaining([
      expect.objectContaining({ component: "base-input" }),
    ])
  );
  let result: unknown;
  await act(async () => {
    result = await agent.act({
      steps: [
        {
          ref: "Adapter display name",
          action: "setValue",
          args: ["Agent draft"],
        },
      ],
    });
  });
  expect(result).toMatchObject({ ok: true });
  expect(
    screen
      .getByRole("textbox", { name: "Adapter display name" })
      .getAttribute("value")
  ).toBe("Agent draft");
});

test("a canceled Base UI callback never reports a successful value edit", async () => {
  render(<ControlledInput refuse={true} />);
  let result: unknown;
  await act(async () => {
    result = await agent.act({
      steps: [
        {
          ref: "Adapter display name",
          action: "setValue",
          args: ["Refused draft"],
        },
      ],
    });
  });
  expect(result).toMatchObject({ ok: false });
  expect(
    screen
      .getByRole("textbox", { name: "Adapter display name" })
      .getAttribute("value")
  ).toBe("Human draft");
});

test("secret and hidden Base UI controls retain their SDK visibility boundary", async () => {
  render(
    <>
      <Input
        aria-label="Adapter credential"
        data-agent-secret={true}
        defaultValue="never-in-sdk-state"
        type="password"
      />
      <div data-agent-hidden={true}>
        <Button onClick={() => undefined}>Private result</Button>
      </div>
    </>
  );
  const snapshot = agent.snapshot();
  expect(JSON.stringify(snapshot)).not.toContain("never-in-sdk-state");
  expect(JSON.stringify(snapshot)).not.toContain("Private result");
  expect(await agent.query({ text: "Adapter credential" })).toEqual(
    expect.arrayContaining([expect.objectContaining({ value: "[redacted]" })])
  );
});

test("the adapter changes a real Base UI checkbox and advertises no read-only input actions", async () => {
  render(
    <>
      <Checkbox aria-label="Adapter enabled" />
      <Input aria-label="Adapter readonly" readOnly={true} value="Immutable" />
    </>
  );
  const checkbox = screen.getByRole("checkbox", { name: "Adapter enabled" });
  fireEvent.click(checkbox);
  expect(checkbox.getAttribute("aria-checked")).toBe("true");
  let result: unknown;
  await act(async () => {
    result = await agent.act({
      steps: [{ ref: "Adapter enabled", action: "setChecked", args: [false] }],
    });
  });
  expect(result).toMatchObject({ ok: true });
  expect(checkbox.getAttribute("aria-checked")).toBe("false");
  expect(await agent.query({ text: "Adapter readonly" })).toEqual(
    expect.arrayContaining([
      expect.objectContaining({ disabled: true, actions: [] }),
    ])
  );
});

function ChoiceControl() {
  const [value, setValue] = useState("first");
  return (
    <Select
      onValueChange={(next) => {
        if (next !== null) {
          setValue(next);
        }
      }}
      value={value}
    >
      <SelectTrigger aria-label="Adapter schema">
        <SelectValue />
      </SelectTrigger>
      <SelectContent>
        <SelectItem value="first">First schema</SelectItem>
        <SelectItem value="second">Second schema</SelectItem>
        <SelectItem disabled={true} value="disabled">
          Disabled schema
        </SelectItem>
      </SelectContent>
    </Select>
  );
}

test("agent selection uses the real Base UI popup and refuses an unknown value", async () => {
  render(<ChoiceControl />);
  let result: unknown;
  await act(async () => {
    result = await agent.act({
      steps: [{ ref: "Adapter schema", action: "setValue", args: ["second"] }],
    });
  });
  expect(result, JSON.stringify(result)).toMatchObject({ ok: true });
  expect(
    screen.getByRole("combobox", { name: "Adapter schema" }).textContent
  ).toContain("second");
  await act(async () => {
    result = await agent.act({
      steps: [
        { ref: "Adapter schema", action: "setValue", args: ["not-an-option"] },
      ],
    });
  });
  expect(result).toMatchObject({ ok: false });
  expect(
    screen.getByRole("combobox", { name: "Adapter schema" }).textContent
  ).toContain("second");
});

test("hidden root markers survive Base UI portals", async () => {
  render(
    <Dialog data-agent-hidden={true} defaultOpen={true}>
      <DialogContent>
        <DialogTitle>Private connection report</DialogTitle>
        <Input
          aria-label="Private portal value"
          defaultValue="never-discovered"
        />
      </DialogContent>
    </Dialog>
  );
  expect(screen.getByRole("dialog").getAttribute("data-agent-hidden")).toBe(
    "true"
  );
  expect(JSON.stringify(agent.snapshot())).not.toContain("never-discovered");
  expect(await agent.query({ text: "Private portal value" })).toEqual([]);
});

test("secret state never reads the credential value getter", () => {
  const input = document.createElement("input");
  input.type = "password";
  Object.defineProperty(input, "value", {
    get() {
      throw new Error("Secret was read");
    },
  });
  expect(baseUiState(input).value).toBe("[redacted]");
});

test("uncontrolled canceled input edits preserve the last accepted native value", async () => {
  const sources: string[] = [];
  render(
    <Input
      aria-label="Vetoed draft"
      defaultValue="Original"
      onValueChange={(_value, details) => {
        sources.push(details.source);
        details.cancel();
      }}
    />
  );
  let result: unknown;
  await act(async () => {
    result = await agent.act({
      steps: [{ ref: "Vetoed draft", action: "setValue", args: ["Rejected"] }],
    });
  });
  expect(result).toMatchObject({ ok: false });
  expect(sources).toEqual(["agent"]);
  const input = screen.getByRole("textbox", { name: "Vetoed draft" });
  expect(input instanceof HTMLInputElement && input.value).toBe("Original");
});

test("invalid numeric values are refused before changing an uncontrolled draft", async () => {
  render(<Input aria-label="Draft port" defaultValue="5432" type="number" />);
  let result: unknown;
  await act(async () => {
    result = await agent.act({
      steps: [{ ref: "Draft port", action: "setValue", args: ["not a port"] }],
    });
  });
  expect(result).toMatchObject({ ok: false });
  const input = screen.getByRole("spinbutton", { name: "Draft port" });
  expect(input instanceof HTMLInputElement && input.value).toBe("5432");
});

function MultipleChoiceControl({ revoke = false }: { revoke?: boolean }) {
  const [value, setValue] = useState(["first", "third"]);
  return (
    <Select
      multiple={true}
      onValueChange={(next) => {
        setValue(next ?? []);
        if (revoke) {
          useAgentAccessStore.getState().setEnabled(false);
        }
      }}
      value={value}
    >
      <SelectTrigger aria-label="Adapter multiple schemas">
        <SelectValue />
      </SelectTrigger>
      <SelectContent>
        <SelectItem value="first">First</SelectItem>
        <SelectItem value="second">Second</SelectItem>
        <SelectItem value="third">Third</SelectItem>
        <SelectItem disabled={true} value="disabled">
          Disabled
        </SelectItem>
      </SelectContent>
    </Select>
  );
}

test("multiple selection applies an exact set without toggling retained items and preflights invalid items", async () => {
  render(<MultipleChoiceControl />);
  let result: unknown;
  await act(async () => {
    result = await agent.act({
      steps: [
        {
          ref: "Adapter multiple schemas",
          action: "setValue",
          args: [["first", "second"]],
        },
      ],
    });
  });
  expect(result).toMatchObject({ ok: true });
  expect(await agent.query({ text: "Adapter multiple schemas" })).toEqual(
    expect.arrayContaining([
      expect.objectContaining({ value: ["first", "second"] }),
    ])
  );
  await act(async () => {
    result = await agent.act({
      steps: [
        {
          ref: "Adapter multiple schemas",
          action: "setValue",
          args: [["third", "disabled"]],
        },
      ],
    });
  });
  expect(result).toMatchObject({ ok: false });
  expect(await agent.query({ text: "Adapter multiple schemas" })).toEqual(
    expect.arrayContaining([
      expect.objectContaining({ value: ["first", "second"] }),
    ])
  );
  await act(async () => {
    result = await agent.act({
      steps: [
        { ref: "Adapter multiple schemas", action: "setValue", args: [[]] },
      ],
    });
  });
  expect(result).toMatchObject({ ok: true });
  expect(await agent.query({ text: "Adapter multiple schemas" })).toEqual(
    expect.arrayContaining([expect.objectContaining({ value: [] })])
  );
});

test("an explicit false child marker cannot reveal a hidden portaled root", () => {
  render(
    <Dialog data-agent-hidden={true} defaultOpen={true}>
      <DialogContent data-agent-hidden={false}>
        <DialogTitle>Private</DialogTitle>
        <Input
          aria-label="Hidden child"
          data-agent-hidden={false}
          defaultValue="not-public"
        />
      </DialogContent>
    </Dialog>
  );
  expect(screen.getByRole("dialog").getAttribute("data-agent-hidden")).toBe(
    "true"
  );
  expect(JSON.stringify(agent.snapshot())).not.toContain("not-public");
});

test("revocation stops the rest of an asynchronous multi-selection instead of claiming success", async () => {
  render(<MultipleChoiceControl revoke={true} />);
  fireEvent.click(
    screen.getByRole("combobox", { name: "Adapter multiple schemas" })
  );
  useAgentAccessStore.getState().setEnabled(true);
  let result: unknown;
  try {
    await act(async () => {
      result = await agent.act({
        steps: [
          {
            ref: "Adapter multiple schemas",
            action: "setValue",
            args: [["second"]],
          },
        ],
      });
    });
    expect(result).toMatchObject({ ok: false });
    expect(
      screen
        .getByRole("option", { name: "Second" })
        .getAttribute("aria-selected")
    ).toBe("false");
    expect(
      screen
        .getByRole("option", { name: "Third" })
        .getAttribute("aria-selected")
    ).toBe("true");
  } finally {
    useAgentAccessStore.getState().setEnabled(false);
  }
});

test("hidden trigger ancestry protects choices rendered into a separate portal", async () => {
  render(
    <div data-agent-hidden={true}>
      <ChoiceControl />
    </div>
  );
  fireEvent.click(screen.getByRole("combobox", { name: "Adapter schema" }));
  expect(
    screen
      .getByRole("option", { name: "Second schema" })
      .closest('[data-agent-hidden="true"]')
  ).not.toBeNull();
  expect(await agent.query({ text: "Second schema" })).toEqual([]);
});

test("hidden controls never read values into SDK state", () => {
  const input = document.createElement("input");
  input.setAttribute("data-agent-hidden", "true");
  Object.defineProperty(input, "value", {
    get() {
      throw new Error("Hidden data was read");
    },
  });
  expect(baseUiState(input)).toMatchObject({
    value: undefined,
    available: false,
  });
});

test("generic Base UI edits retain agent provenance in SDK observation", async () => {
  const sources: string[] = [];
  const stop = observe((change) => {
    if (change.label === "Adapter display name" && change.key === "value") {
      sources.push(change.source);
    }
  });
  try {
    render(<ControlledInput />);
    sources.length = 0;
    await act(async () => {
      await agent.act({
        steps: [
          {
            ref: "Adapter display name",
            action: "setValue",
            args: ["Attributed agent edit"],
          },
        ],
      });
    });
    expect(sources).toEqual(["agent"]);
  } finally {
    stop();
  }
});

function MixedCheckbox() {
  const [checked, setChecked] = useState(false);
  return (
    <Checkbox
      aria-label="Partial selection"
      checked={checked}
      indeterminate={!checked}
      onCheckedChange={setChecked}
    />
  );
}

test("a mixed checkbox is not mistaken for false or toggled to the opposite requested state", async () => {
  render(<MixedCheckbox />);
  const checkbox = screen.getByRole("checkbox", { name: "Partial selection" });
  let result: unknown;
  await act(async () => {
    result = await agent.act({
      steps: [
        { ref: "Partial selection", action: "setChecked", args: [false] },
      ],
    });
  });
  expect(result).toMatchObject({ ok: false });
  expect(checkbox.getAttribute("aria-checked")).toBe("mixed");
  await act(async () => {
    result = await agent.act({
      steps: [{ ref: "Partial selection", action: "setChecked", args: [true] }],
    });
  });
  expect(result).toMatchObject({ ok: true });
  expect(checkbox.getAttribute("aria-checked")).toBe("true");
});
