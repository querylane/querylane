import { create as createProto } from "@bufbuild/protobuf";
import { type ReactNode, useState } from "react";
import { expect, test, vi } from "vitest";
import { page } from "vitest/browser";
import { render } from "vitest-browser-react";
import { ScreenshotFrame } from "@/__tests__/browser-test-utils";
import { InstanceConfigurationSection } from "@/components/console-pages/instance-configuration-section";
import { InstanceDangerZoneSection } from "@/components/console-pages/instance-danger-zone-section";
import { InstanceDeleteDialog } from "@/components/console-pages/instance-delete-dialog";
import {
  Instance_CredentialState,
  InstanceSchema,
  PostgresConfig_SslMode,
  PostgresConfigSchema,
} from "@/protogen/querylane/console/v1alpha1/instance_pb";

const TEST_NUMBER_320 = 320;
const TEST_NUMBER_900 = 900;

function createInstance() {
  return createProto(InstanceSchema, {
    config: createProto(PostgresConfigSchema, {
      database: "querylane",
      host: "analytics-writer.internal.querylane.test",
      password: "redacted-secret",
      port: 5432,
      sslMode: PostgresConfig_SslMode.VERIFY_FULL,
      username: "querylane_app",
    }),
    displayName: "Production Analytics Writer",
    labels: {
      environment: "production",
      owner: "data-platform",
      region: "eu-central-1",
    },
    name: "instances/prod-analytics-writer",
  });
}

function createUnreadableInstance() {
  const instance = createInstance();
  instance.credentialState = Instance_CredentialState.UNREADABLE;
  instance.credentialError =
    "Stored credentials cannot be read. Re-enter the password to restore access.";
  return instance;
}

function renderInstanceConfigSurface(children: ReactNode) {
  render(
    <ScreenshotFrame>
      <div className="w-[1100px] space-y-6 rounded-2xl border border-border bg-background p-8 text-foreground">
        {children}
      </div>
    </ScreenshotFrame>
  );
}

function InstanceConfigServerFieldErrorFixture() {
  const [formNotice, setFormNotice] = useState<{
    message: string;
    variant: "error" | "success";
  } | null>(null);
  const passwordMessage =
    "PostgreSQL rejected this password. Check the password, then try again.";

  return (
    <InstanceConfigurationSection
      formNotice={formNotice}
      instance={createInstance()}
      isConfigManaged={false}
      onInvalidSave={vi.fn()}
      onSave={vi.fn(() => {
        setFormNotice({
          message: "Fix the highlighted fields, then save again.",
          variant: "error",
        });
        return {
          fieldErrors: {
            password: passwordMessage,
          },
          firstInvalidField: "password" as const,
        };
      })}
      pending={false}
    />
  );
}

test("editable instance configuration shows connection fields, labels, and save affordance", async () => {
  renderInstanceConfigSurface(
    <InstanceConfigurationSection
      formNotice={{
        message: "Last saved from browser visual fixture.",
        variant: "success",
      }}
      instance={createInstance()}
      isConfigManaged={false}
      onInvalidSave={vi.fn()}
      onSave={vi.fn()}
      pending={false}
    />
  );

  await expect.element(page.getByText("Configuration")).toBeVisible();
  await expect
    .element(page.getByLabelText("Host"))
    .toHaveValue("analytics-writer.internal.querylane.test");
  await expect.element(page.getByText("Labels")).toBeVisible();
  await expect.element(page.getByText("Save changes")).toBeVisible();
  await expect(page.getByTestId("screenshot-frame")).toMatchScreenshot(
    "instance-config-editable"
  );
});

test("editable instance configuration surfaces validation errors near fields", async () => {
  renderInstanceConfigSurface(
    <InstanceConfigurationSection
      formNotice={{
        message: "Fix the highlighted fields, then save again.",
        variant: "error",
      }}
      instance={createInstance()}
      isConfigManaged={false}
      onInvalidSave={vi.fn()}
      onSave={vi.fn()}
      pending={false}
    />
  );

  await page.getByLabelText("Host").fill("");
  await page.getByLabelText("Port").fill("65536");
  await page.getByText("Save changes").click();

  await expect.element(page.getByText("Could not save")).toBeVisible();
  await expect.element(page.getByText("Host is required.")).toBeVisible();
  await expect
    .element(page.getByText("Port must be between 1 and 65535."))
    .toBeVisible();
  await expect(page.getByTestId("screenshot-frame")).toMatchScreenshot(
    "instance-config-validation-errors"
  );
});

test("editable instance configuration anchors server field errors to fields", async () => {
  renderInstanceConfigSurface(<InstanceConfigServerFieldErrorFixture />);

  const passwordInput = page.getByRole("textbox", { name: "Password" });
  await passwordInput.fill("wrong-password");
  await page.getByText("Save changes").click();

  await expect.element(page.getByText("Could not save")).toBeVisible();
  await expect
    .element(
      page.getByText(
        "PostgreSQL rejected this password. Check the password, then try again."
      )
    )
    .toBeVisible();
  await expect.element(passwordInput).toHaveFocus();
  await expect.element(passwordInput).toHaveAttribute("aria-invalid", "true");
  await expect(page.getByTestId("screenshot-frame")).toMatchScreenshot(
    "instance-config-server-field-errors"
  );
});

test("config-managed instance configuration disables edits while preserving details", async () => {
  renderInstanceConfigSurface(
    <InstanceConfigurationSection
      formNotice={{
        message: "Managed from querylane.yaml. Restart the server after edits.",
        variant: "success",
      }}
      instance={createInstance()}
      isConfigManaged={true}
      onInvalidSave={vi.fn()}
      onSave={vi.fn()}
      pending={false}
    />
  );

  await expect
    .element(page.getByText("Connection details registered for this instance."))
    .toBeVisible();
  await expect.element(page.getByLabelText("Username")).toBeDisabled();
  await expect.element(page.getByText("Labels")).toBeVisible();
  await expect(page.getByTestId("screenshot-frame")).toMatchScreenshot(
    "instance-config-managed"
  );
});

test("instance delete dialog and danger zone make destructive actions explicit", async () => {
  renderInstanceConfigSurface(
    <>
      <InstanceDangerZoneSection
        instanceDisplayName="Production Analytics Writer"
        onDelete={vi.fn()}
        pending={false}
      />
      <InstanceDeleteDialog
        instanceDisplayName="Production Analytics Writer"
        instanceResourceName="instances/prod-analytics-writer"
        onConfirm={vi.fn()}
        onOpenChange={vi.fn()}
        open={true}
        pending={false}
      />
    </>
  );

  await expect.element(page.getByText("Danger zone")).toBeVisible();
  await expect
    .element(page.getByRole("heading", { name: "Delete instance?" }))
    .toBeVisible();
  await expect.element(page.getByText("Delete instance").last()).toBeVisible();
  await expect(page.getByTestId("screenshot-frame")).toMatchScreenshot(
    "instance-delete-confirmation"
  );
});

test("credential recovery action does not overlap the alert copy on phones", async () => {
  await page.viewport(TEST_NUMBER_320, TEST_NUMBER_900);
  render(
    <ScreenshotFrame>
      <div className="w-[240px] rounded-2xl border border-border bg-background p-2 text-foreground">
        <InstanceConfigurationSection
          formNotice={null}
          instance={createUnreadableInstance()}
          isConfigManaged={false}
          onInvalidSave={vi.fn()}
          onSave={vi.fn()}
          pending={false}
        />
      </div>
    </ScreenshotFrame>
  );

  const title = page.getByText("Credentials need attention");
  const action = page.getByRole("button", { name: "Re-enter password" });
  await expect.element(title).toBeVisible();
  await expect.element(action).toBeVisible();

  const titleRect = title.element().getBoundingClientRect();
  const actionRect = action.element().getBoundingClientRect();
  const overlaps =
    titleRect.left < actionRect.right &&
    titleRect.right > actionRect.left &&
    titleRect.top < actionRect.bottom &&
    titleRect.bottom > actionRect.top;
  expect(overlaps).toBe(false);
});
