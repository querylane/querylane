import { create as createProto } from "@bufbuild/protobuf";
import { page } from "@rstest/browser";
import { render } from "@rstest/browser-react";
import { expect, rs, test } from "@rstest/core";
import { type ReactNode, useState } from "react";
import { ScreenshotFrame } from "@/__tests__/browser-test-utils";
import { InstanceConfigurationSection } from "@/components/console-pages/instance-configuration-section";
import { InstanceDangerZoneSection } from "@/components/console-pages/instance-danger-zone-section";
import { InstanceDeleteDialog } from "@/components/console-pages/instance-delete-dialog";
import {
  InstanceSchema,
  PostgresConfig_SslMode,
  PostgresConfigSchema,
} from "@/protogen/querylane/console/v1alpha1/instance_pb";

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

// Pixels for these states, and the phone-width credential recovery layout,
// live in e2e/visual/console-resources.spec.ts on the real configuration route.
function renderInstanceConfigSurface(children: ReactNode) {
  return render(
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
      onInvalidSave={rs.fn()}
      onSave={rs.fn(() => {
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
  await renderInstanceConfigSurface(
    <InstanceConfigurationSection
      formNotice={{
        message: "Last saved from browser visual fixture.",
        variant: "success",
      }}
      instance={createInstance()}
      isConfigManaged={false}
      onInvalidSave={rs.fn()}
      onSave={rs.fn()}
      pending={false}
    />
  );

  await expect.element(page.getByText("Configuration")).toBeVisible();
  await expect
    .element(page.getByLabel("Host"))
    .toHaveValue("analytics-writer.internal.querylane.test");
  await expect.element(page.getByText("Labels")).toBeVisible();
  await expect.element(page.getByText("Save changes")).toBeVisible();
});

test("editable instance configuration surfaces validation errors near fields", async () => {
  await renderInstanceConfigSurface(
    <InstanceConfigurationSection
      formNotice={{
        message: "Fix the highlighted fields, then save again.",
        variant: "error",
      }}
      instance={createInstance()}
      isConfigManaged={false}
      onInvalidSave={rs.fn()}
      onSave={rs.fn()}
      pending={false}
    />
  );

  await page.getByLabel("Host").fill("");
  await page.getByLabel("Port").fill("65536");
  await page.getByText("Save changes").click();

  await expect.element(page.getByText("Could not save")).toBeVisible();
  await expect.element(page.getByText("Host is required.")).toBeVisible();
  await expect
    .element(page.getByText("Port must be between 1 and 65535."))
    .toBeVisible();
});

test("editable instance configuration anchors server field errors to fields", async () => {
  await renderInstanceConfigSurface(<InstanceConfigServerFieldErrorFixture />);

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
  await expect.element(passwordInput).toBeFocused();
  await expect.element(passwordInput).toHaveAttribute("aria-invalid", "true");
});

test("config-managed instance configuration disables edits while preserving details", async () => {
  await renderInstanceConfigSurface(
    <InstanceConfigurationSection
      formNotice={{
        message: "Managed from querylane.yaml. Restart the server after edits.",
        variant: "success",
      }}
      instance={createInstance()}
      isConfigManaged={true}
      onInvalidSave={rs.fn()}
      onSave={rs.fn()}
      pending={false}
    />
  );

  await expect
    .element(
      page.getByText(
        "Connection details are read-only because this instance is managed in the server configuration file. Update that file and restart Querylane to make changes."
      )
    )
    .toBeVisible();
  await expect.element(page.getByLabel("Username")).toBeDisabled();
  await expect.element(page.getByText("Labels")).toBeVisible();
});

test("instance delete dialog and danger zone make destructive actions explicit", async () => {
  await renderInstanceConfigSurface(
    <>
      <InstanceDangerZoneSection
        instanceDisplayName="Production Analytics Writer"
        onDelete={rs.fn()}
        pending={false}
      />
      <InstanceDeleteDialog
        instanceDisplayName="Production Analytics Writer"
        instanceResourceName="instances/prod-analytics-writer"
        onConfirm={rs.fn()}
        onOpenChange={rs.fn()}
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
});
