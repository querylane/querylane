import { Database, ServerOff } from "lucide-react";
import type { ReactNode } from "react";
import { AppErrorView, AppInlineError } from "@/components/app-error-view";
import { ConfigManagedEmptyState } from "@/components/config-managed-empty-state";
import {
  MetadataCard,
  PageHeader,
  SummaryCard,
} from "@/components/console-pages/console-layout";
import { EmptyState } from "@/components/empty-state";
import { Button } from "@/components/ui/button";
import { normalizeAppUiError } from "@/lib/ui-error";
import { SQLSTATE_SCENARIOS } from "@/visual-harness/sqlstate-scenarios";

// Presentational console states shared by rstest behavior tests and the
// Playwright visual harness, so both runners exercise identical markup.

function ignoreAction() {
  return undefined;
}

function ignoreRetry() {
  return Promise.resolve();
}

function ConsoleSurface({ children }: { children: ReactNode }) {
  return (
    <div className="w-[1100px] rounded-2xl border border-border bg-background p-8 text-foreground">
      {children}
    </div>
  );
}

function ConsoleResourceOverviewScenario() {
  return (
    <ConsoleSurface>
      <div className="space-y-6">
        <PageHeader
          description="Backend-reported metadata for a production PostgreSQL instance. Long resource identifiers should stay contained without breaking the layout."
          eyebrow="Instance"
          title="Production Analytics Writer"
        />
        <div className="grid gap-4 md:grid-cols-4">
          <SummaryCard label="Databases" value="24" />
          <SummaryCard label="Schemas" value="186" />
          <SummaryCard label="Tables" value="4,812" />
          <SummaryCard label="Connections" value="74 / 250" />
        </div>
        <MetadataCard
          items={[
            {
              label: "Host",
              value: "analytics-writer.internal.querylane.test",
            },
            { label: "Owner", value: "data-platform" },
            { label: "SSL mode", value: "verify-full" },
          ]}
          title="Metadata"
        />
      </div>
    </ConsoleSurface>
  );
}

function ConsoleSqlstateScenario() {
  return (
    <ConsoleSurface>
      <div className="space-y-5">
        <PageHeader
          description="PostgreSQL SQLSTATE diagnostics should stay visible when catalog, query, and metadata requests fail."
          eyebrow="Error states"
          title="SQLSTATE diagnostics"
        />
        <div className="grid gap-4">
          {SQLSTATE_SCENARIOS.map((scenario) => (
            <section
              className="space-y-2"
              data-testid={`sqlstate-scenario-${scenario.slug}`}
              key={scenario.label}
            >
              <h2 className="font-semibold text-base">{scenario.label}</h2>
              <AppInlineError
                error={normalizeAppUiError(scenario.error, {
                  area: "console.sqlstate.visual",
                  endpoint: scenario.endpoint,
                  source: "query",
                  surface: "inline",
                })}
                onRetry={ignoreRetry}
                retryLabel="Retry"
              />
            </section>
          ))}
        </div>
      </div>
    </ConsoleSurface>
  );
}

function ConsoleEmptyStatesScenario() {
  return (
    <ConsoleSurface>
      <div className="grid gap-6 md:grid-cols-2">
        <ConfigManagedEmptyState />
        <EmptyState
          action={
            <Button onClick={ignoreAction} size="sm" type="button">
              Create database
            </Button>
          }
          description="No databases have been discovered for this instance yet. Refresh metadata or create the first database."
          icon={Database}
          title="No databases found"
        />
      </div>
    </ConsoleSurface>
  );
}

function ConsolePageErrorScenario() {
  const error = normalizeAppUiError(
    new Error("connection refused while loading instance metadata"),
    {
      area: "console.instance",
      endpoint: "/querylane.console.v1alpha1.InstanceService/GetInstance",
      source: "query",
      surface: "route",
    }
  );

  return (
    <ConsoleSurface>
      <AppErrorView
        actions={
          <Button
            onClick={ignoreAction}
            size="sm"
            type="button"
            variant="outline"
          >
            <ServerOff className="size-4" />
            Check backend
          </Button>
        }
        error={error}
        onRetry={ignoreRetry}
        retryLabel="Retry metadata"
        variant="page"
      />
    </ConsoleSurface>
  );
}

export {
  ConsoleEmptyStatesScenario,
  ConsolePageErrorScenario,
  ConsoleResourceOverviewScenario,
  ConsoleSqlstateScenario,
};
