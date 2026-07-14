import { Database } from "lucide-react";
import { type ReactNode, useId } from "react";
import { expect, test, vi } from "vitest";
import { page } from "vitest/browser";
import { render } from "vitest-browser-react";
import { ScreenshotFrame } from "@/__tests__/browser-test-utils";
import { AsyncSectionState } from "@/components/async-section-state";
import { BrandedLoadingState } from "@/components/branded-loading-state";
import { ConfigManagedNotice } from "@/components/config-managed-notice";
import { DangerZoneSection } from "@/components/danger-zone-section";
import { EmptyState } from "@/components/empty-state";
import { PasswordInput } from "@/components/password-input";
import { RetryActionButton } from "@/components/retry-action-button";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";

function renderFeedbackSurface(children: ReactNode) {
  render(
    <ScreenshotFrame>
      <div className="w-[1100px] rounded-2xl border border-border bg-background p-8 text-foreground">
        {children}
      </div>
    </ScreenshotFrame>
  );
}

test("feedback states cover loading, refreshing, empty, and config-managed guidance", async () => {
  renderFeedbackSurface(
    <div className="grid gap-6 md:grid-cols-2">
      <div className="space-y-4 rounded-xl border border-border p-5">
        <h2 className="font-semibold text-lg">{"Section states"}</h2>
        <AsyncSectionState
          hasContent={false}
          isPending={true}
          loadingMessage="Loading schema metadata…"
        />
        <AsyncSectionState
          hasContent={true}
          isRefreshing={true}
          refreshingMessage="Refreshing table statistics…"
        >
          <div className="rounded-lg border border-border bg-card p-4 text-sm">
            {"Existing content stays visible while fresh metadata loads."}
          </div>
        </AsyncSectionState>
      </div>
      <div className="space-y-4 rounded-xl border border-border p-5">
        <ConfigManagedNotice />
        <EmptyState
          action={
            <Button size="sm" type="button">
              {"Add instance"}
            </Button>
          }
          description="Connect a PostgreSQL instance before browsing schemas, tables, or query history."
          icon={Database}
          title="No instance selected"
        />
      </div>
    </div>
  );

  await expect
    .element(page.getByText("Loading schema metadata…"))
    .toBeVisible();
  await expect
    .element(page.getByText("Refreshing table statistics…"))
    .toBeVisible();
  await expect
    .element(page.getByText("Managed via configuration file"))
    .toBeVisible();
  await expect(page.getByTestId("screenshot-frame")).toMatchScreenshot(
    "feedback-loading-refreshing-empty"
  );
});

function FormRecoveryDangerSurface() {
  const passwordId = useId();

  return (
    <div className="space-y-6">
      <div className="grid gap-5 md:grid-cols-[minmax(0,1fr)_minmax(0,1fr)]">
        <div className="space-y-3 rounded-xl border border-border p-5">
          <h2 className="font-semibold text-lg">{"Connection credentials"}</h2>
          <div className="grid gap-2 text-sm">
            <Label htmlFor={passwordId}>{"Password"}</Label>
            <PasswordInput
              defaultValue="correct-horse-battery-staple"
              id={passwordId}
            />
          </div>
          <RetryActionButton
            label="Test connection again"
            onRetry={vi.fn(async () => undefined)}
            pendingLabel="Testing connection…"
            variant="outline"
          />
        </div>
        <BrandedLoadingState
          description="Preparing connection state before rendering the console."
          title="Loading Querylane"
          variant="section"
        />
      </div>
      <DangerZoneSection
        actions={[
          {
            actionLabel: "Delete instance",
            description:
              "Removes connection metadata and query history for this PostgreSQL instance.",
            handleClick: vi.fn(),
            title: "Delete Production Analytics Writer",
          },
          {
            actionLabel: "Reset metadata",
            description:
              "Disabled until the backend reports a healthy connection.",
            disabled: true,
            handleClick: vi.fn(),
            title: "Reset local metadata cache",
          },
        ]}
        description="High-risk actions must stay visually separated from normal configuration controls."
        testId="danger-zone-visual"
      />
    </div>
  );
}

test("form recovery states cover password reveal, retry, and destructive actions", async () => {
  renderFeedbackSurface(<FormRecoveryDangerSurface />);

  await expect
    .element(page.getByLabelText("Password", { exact: true }))
    .toBeVisible();
  await expect.element(page.getByText("Danger zone")).toBeVisible();
  await expect
    .element(page.getByRole("heading", { name: "Loading Querylane" }))
    .toBeVisible();
  await expect(page.getByTestId("screenshot-frame")).toMatchScreenshot(
    "feedback-form-recovery-danger"
  );
});
