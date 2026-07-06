import { cleanup, render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, describe, expect, test, vi } from "vitest";
import { InstanceDeleteDialog } from "@/components/console-pages/instance-delete-dialog";

function renderDeleteDialog({
  onConfirm = vi.fn(),
  onOpenChange = vi.fn(),
  open = true,
  pending = false,
}: {
  onConfirm?: () => void;
  onOpenChange?: (open: boolean) => void;
  open?: boolean;
  pending?: boolean;
} = {}) {
  return {
    onConfirm,
    onOpenChange,
    ...render(
      <InstanceDeleteDialog
        instanceDisplayName="Production"
        instanceResourceName="instances/prod"
        onConfirm={onConfirm}
        onOpenChange={onOpenChange}
        open={open}
        pending={pending}
      />
    ),
  };
}

afterEach(() => cleanup());

describe("InstanceDeleteDialog", () => {
  test("requires the stable instance resource name before confirming", async () => {
    const user = userEvent.setup();
    const { onConfirm } = renderDeleteDialog();

    expect(screen.getByText("Production")).toBeTruthy();
    expect(screen.getAllByText("instances/prod").length).toBeGreaterThan(0);

    const input = screen.getByLabelText("Type instances/prod to confirm");
    const deleteButton = screen.getByRole("button", {
      name: "Delete instance",
    });

    expect(deleteButton).toHaveProperty("disabled", true);

    await user.type(input, "Production");
    expect(deleteButton).toHaveProperty("disabled", true);

    await user.clear(input);
    await user.type(input, "instances/prod");
    expect(deleteButton).toHaveProperty("disabled", false);

    await user.click(deleteButton);
    expect(onConfirm).toHaveBeenCalledTimes(1);
  });

  test("resets confirmation text when closed", async () => {
    const user = userEvent.setup();
    renderDeleteDialog();

    const input = screen.getByLabelText("Type instances/prod to confirm");
    await user.type(input, "instances/prod");
    expect(input).toHaveProperty("value", "instances/prod");

    await user.click(screen.getByRole("button", { name: "Cancel" }));
    expect(input).toHaveProperty("value", "");
  });

  test("disables confirmation controls while delete is pending", () => {
    renderDeleteDialog({ pending: true });

    expect(
      screen.getByLabelText("Type instances/prod to confirm")
    ).toHaveProperty("disabled", true);
    expect(screen.getByRole("button", { name: "Cancel" })).toHaveProperty(
      "disabled",
      true
    );
    expect(
      screen.getByRole("button", { name: "Delete instance" })
    ).toHaveProperty("disabled", true);
  });
});
