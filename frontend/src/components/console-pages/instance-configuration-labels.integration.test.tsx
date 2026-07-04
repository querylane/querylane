import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, test, vi } from "vitest";
import type { InstanceFormState } from "@/components/console-pages/instance-config-model";
import { InstanceConfigurationLabels } from "@/components/console-pages/instance-configuration-labels";

const baseFormState: InstanceFormState = {
  database: "querylane",
  displayName: "Production",
  host: "db.internal",
  labels: [
    { id: "env", key: "env", value: "prod" },
    { id: "team", key: "team", value: "analytics" },
  ],
  password: "secret",
  port: "5432",
  sslMode: "prefer",
  sslNegotiation: "postgres",
  username: "querylane",
};

describe("InstanceConfigurationLabels", () => {
  test("names dynamic label inputs and remove actions accessibly", async () => {
    const user = userEvent.setup();
    const setFormState = vi.fn();

    render(
      <InstanceConfigurationLabels
        formErrors={{}}
        formState={baseFormState}
        isConfigManaged={false}
        setFormState={setFormState}
      />
    );

    expect(
      (screen.getByRole("textbox", { name: "Label key 1" }) as HTMLInputElement)
        .value
    ).toBe("env");
    expect(
      (
        screen.getByRole("textbox", {
          name: "Label value 2",
        }) as HTMLInputElement
      ).value
    ).toBe("analytics");

    const removeButtons = screen.getAllByRole("button", {
      name: "Remove label",
    });
    expect(removeButtons).toHaveLength(2);
    const secondRemoveButton = removeButtons[1];
    if (!secondRemoveButton) {
      throw new Error("Expected a second remove label button");
    }
    await user.click(secondRemoveButton);

    expect(setFormState).toHaveBeenCalledOnce();
    const update = setFormState.mock.calls[0]?.[0];
    expect(typeof update).toBe("function");
    expect(update(baseFormState).labels).toEqual([
      { id: "env", key: "env", value: "prod" },
    ]);
  });
});
