import { Database } from "lucide-react";
import { type ReactNode, useId } from "react";
import { AppErrorView } from "@/components/app-error-view";
import { AsyncSectionState } from "@/components/async-section-state";
import { BrandedLoadingState } from "@/components/branded-loading-state";
import { ConfigManagedNotice } from "@/components/config-managed-notice";
import { DangerZoneSection } from "@/components/danger-zone-section";
import { EmptyState } from "@/components/empty-state";
import { PasswordInput } from "@/components/password-input";
import { RetryActionButton } from "@/components/retry-action-button";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import {
  createPostgresError,
  POSTGRES_ERROR_EXAMPLES,
  POSTGRES_PERMISSION_ERROR_EXAMPLE,
} from "@/visual-harness/feedback-scenario-data";

// Shared feedback surfaces rendered by rstest behavior tests and the
// Playwright visual harness, so both runners exercise identical markup.

function ignoreAction() {
  return undefined;
}

function ignoreRetry() {
  return Promise.resolve();
}

function FeedbackSurface({ children }: { children: ReactNode }) {
  return (
    <div className="w-[1100px] rounded-2xl border border-border bg-background p-8 text-foreground">
      {children}
    </div>
  );
}

function FeedbackSectionStatesScenario() {
  return (
    <FeedbackSurface>
      <div className="grid gap-6 md:grid-cols-2">
        <div className="space-y-4 rounded-xl border border-border p-5">
          <h2 className="font-semibold text-lg">Section states</h2>
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
              Existing content stays visible while fresh metadata loads.
            </div>
          </AsyncSectionState>
        </div>
        <div className="space-y-4 rounded-xl border border-border p-5">
          <ConfigManagedNotice />
          <EmptyState
            action={
              <Button onClick={ignoreAction} size="sm" type="button">
                Add instance
              </Button>
            }
            description="Connect a PostgreSQL instance before browsing schemas, tables, or query history."
            icon={Database}
            title="No instance selected"
          />
        </div>
      </div>
    </FeedbackSurface>
  );
}

function FeedbackFormRecoveryScenario() {
  const passwordId = useId();

  return (
    <FeedbackSurface>
      <div className="space-y-6">
        <div className="grid gap-5 md:grid-cols-[minmax(0,1fr)_minmax(0,1fr)]">
          <div className="space-y-3 rounded-xl border border-border p-5">
            <h2 className="font-semibold text-lg">Connection credentials</h2>
            <div className="grid gap-2 text-sm">
              <Label htmlFor={passwordId}>Password</Label>
              <PasswordInput
                defaultValue="correct-horse-battery-staple"
                id={passwordId}
              />
            </div>
            <RetryActionButton
              label="Test connection again"
              onRetry={ignoreRetry}
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
              handleClick: ignoreAction,
              title: "Delete Production Analytics Writer",
            },
            {
              actionLabel: "Reset metadata",
              description:
                "Disabled until the backend reports a healthy connection.",
              disabled: true,
              handleClick: ignoreAction,
              title: "Reset local metadata cache",
            },
          ]}
          description="High-risk actions must stay visually separated from normal configuration controls."
          testId="danger-zone-visual"
        />
      </div>
    </FeedbackSurface>
  );
}

function PostgresErrorSummariesScenario() {
  return (
    <div className="w-[1100px] space-y-5 rounded-2xl border border-border bg-background p-6 text-foreground">
      <header className="space-y-1">
        <h1 className="font-semibold text-2xl tracking-tight">
          Common PostgreSQL errors
        </h1>
        <p className="text-muted-foreground text-sm">
          The summary and recommendation stay visible. SQLSTATE and the
          PostgreSQL server message are available in Error details.
        </p>
      </header>

      <div className="grid grid-cols-2 gap-4">
        {POSTGRES_ERROR_EXAMPLES.map((example) => (
          <section
            className="space-y-2 rounded-xl border border-border bg-muted/20 p-4"
            key={example.sqlstate}
          >
            <h2 className="font-medium text-sm">{example.label}</h2>
            <AppErrorView error={createPostgresError(example)} />
          </section>
        ))}
      </div>
    </div>
  );
}

function PostgresErrorDetailsScenario() {
  return (
    <div className="w-[720px] rounded-2xl border border-border bg-background p-6 text-foreground">
      <AppErrorView
        error={createPostgresError(POSTGRES_PERMISSION_ERROR_EXAMPLE)}
        onRetry={ignoreRetry}
        retryLabel="Retry query"
      />
    </div>
  );
}

export {
  FeedbackFormRecoveryScenario,
  FeedbackSectionStatesScenario,
  PostgresErrorDetailsScenario,
  PostgresErrorSummariesScenario,
};
