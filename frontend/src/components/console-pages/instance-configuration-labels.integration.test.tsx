import { describe, expect, rs, test } from "@rstest/core";
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { InstanceConfigurationLabels } from "@/components/console-pages/instance-configuration-labels";

const labels = [
  { id: "env", key: "env", value: "prod" },
  { id: "team", key: "team", value: "analytics" },
];

describe("InstanceConfigurationLabels", () => {
  test("names dynamic label inputs and remove actions accessibly", async () => {
    const user = userEvent.setup();
    const onChange = rs.fn();

    render(
      <InstanceConfigurationLabels
        isConfigManaged={false}
        labels={labels}
        onChange={onChange}
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
    const [, secondRemoveButton] = removeButtons;
    if (!secondRemoveButton) {
      throw new Error("Expected a second remove label button");
    }
    await user.click(secondRemoveButton);

    expect(onChange).toHaveBeenCalledWith([
      { id: "env", key: "env", value: "prod" },
    ]);
  });
});
