"use client";

import { AlertCircle, ChevronDown, TriangleAlert } from "lucide-react";
import { SectionCard } from "@/components/console-pages/console-layout";
import type { InstanceRecord } from "@/components/console-pages/instance-config-model";
import {
  buildConnectedEndpointRow,
  buildDisconnectedDiagnosticRows,
  buildInstanceFacts,
  buildLiveHealthRows,
  type HealthRowModel,
  type HealthRowTone,
} from "@/components/console-pages/instance-health-rows";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import {
  Collapsible,
  CollapsibleContent,
  CollapsibleTrigger,
} from "@/components/ui/collapsible";
import { Separator } from "@/components/ui/separator";
import { Skeleton } from "@/components/ui/skeleton";
import type { DbConnectionStatus } from "@/lib/console-resources";
import { cn } from "@/lib/utils";
import type { Status } from "@/protogen/google/rpc/status_pb";
import type {
  InstanceHealth,
  ServerInfo,
} from "@/protogen/querylane/console/v1alpha1/instance_pb";

const TONE_DOT_CLASS: Record<HealthRowTone, string> = {
  error: "bg-destructive",
  muted: "bg-muted-foreground/40",
  ok: "bg-success",
  warning: "bg-amber-500",
};

const TONE_SR_LABEL: Record<HealthRowTone, string> = {
  error: "Error",
  muted: "No data",
  ok: "OK",
  warning: "Warning",
};

function InstanceHealthRow({ row }: { row: HealthRowModel }) {
  const detailId = `instance-health-${row.id}-detail`;
  return (
    <li className="list-none">
      <Collapsible
        className="group/health-check rounded-md data-[tone=error]:border data-[tone=error]:border-destructive/30 data-[tone=error]:bg-destructive/5"
        data-tone={row.tone}
      >
        <CollapsibleTrigger
          aria-controls={detailId}
          className="group/health-row flex w-full items-center gap-3 rounded-md p-2 text-left outline-none transition-colors hover:bg-muted/50 focus-visible:ring-3 focus-visible:ring-ring/50 group-data-[tone=error]/health-check:focus-visible:ring-destructive/30 group-data-[tone=error]/health-check:hover:bg-destructive/10"
        >
          {row.tone === "error" ? (
            <AlertCircle
              aria-hidden="true"
              className="size-4 shrink-0 text-destructive"
            />
          ) : (
            <span
              aria-hidden="true"
              className={cn(
                "size-2 shrink-0 rounded-full",
                TONE_DOT_CLASS[row.tone]
              )}
            />
          )}
          <span className="sr-only">{TONE_SR_LABEL[row.tone]}:</span>
          <span className="w-32 shrink-0 truncate font-medium text-foreground text-sm sm:w-40">
            {row.label}
          </span>
          <span className="min-w-0 flex-1 truncate text-[0.8125rem] text-muted-foreground group-data-[tone=error]/health-check:text-destructive">
            {row.summary}
          </span>
          <ChevronDown
            aria-hidden="true"
            className="size-4 shrink-0 text-muted-foreground/70 transition-transform group-aria-expanded/health-row:rotate-180 group-data-[tone=error]/health-check:text-destructive/70"
          />
        </CollapsibleTrigger>
        <CollapsibleContent>
          <dl
            className="grid gap-x-8 gap-y-2 pt-1 pr-2 pb-3 pl-7 group-data-[tone=error]/health-check:pl-9 sm:grid-cols-2 lg:grid-cols-3"
            id={detailId}
          >
            {row.detail.map((entry) => (
              <div className="flex min-w-0 flex-col gap-0.5" key={entry.label}>
                <dt className="text-muted-foreground text-xs group-data-[tone=error]/health-check:text-destructive/80">
                  {entry.label}
                </dt>
                <dd className="min-w-0 break-words text-[0.8125rem] text-foreground tabular-nums [overflow-wrap:anywhere] group-data-[tone=error]/health-check:text-destructive">
                  {entry.value}
                </dd>
              </div>
            ))}
          </dl>
        </CollapsibleContent>
      </Collapsible>
    </li>
  );
}

const SKELETON_ROW_KEYS = [
  "connections",
  "replication",
  "stats-access",
  "pg-stat-statements",
  "autovacuum",
] as const;

function HealthRowsSkeleton() {
  return (
    <output aria-label="Loading health checks" className="flex flex-col">
      {SKELETON_ROW_KEYS.map((key) => (
        <div className="flex items-center gap-3 px-2 py-2.5" key={key}>
          <Skeleton className="size-2 rounded-full" />
          <Skeleton className="h-3.5 w-32 sm:w-40" />
          <Skeleton className="h-3.5 max-w-72 flex-1" />
        </div>
      ))}
    </output>
  );
}

function InstanceFactsHeader({ facts }: { facts: string[] }) {
  return (
    <p className="flex flex-wrap items-center gap-x-2 gap-y-1 text-[0.8125rem] text-foreground/90">
      {facts.map((fact, index) => (
        <span className="inline-flex items-center gap-2" key={fact}>
          {index > 0 ? (
            <span aria-hidden="true" className="text-border">
              ·
            </span>
          ) : null}
          <span className="tabular-nums">{fact}</span>
        </span>
      ))}
    </p>
  );
}

/**
 * Health section for the instance overview page.
 *
 * Connected: a slim server-facts header plus status-driven rows from the
 * CheckInstanceHealth RPC (connection confirmation, connections activity,
 * replication, stats access, pg_stat_statements, autovacuum).
 *
 * Disconnected/error: diagnostic rows (TCP, authentication, TLS) derived
 * from stored instance metadata that explain why the instance is down.
 */
function InstanceHealthSection({
  connectionStatus,
  extensionsInstalledCount,
  health,
  healthPartialErrors,
  healthPending,
  instance,
  serverInfo,
}: {
  connectionStatus: DbConnectionStatus;
  extensionsInstalledCount: number | undefined;
  health: InstanceHealth | undefined;
  healthPartialErrors: Status[] | undefined;
  healthPending: boolean;
  instance: InstanceRecord;
  serverInfo?: ServerInfo | undefined;
}) {
  const isConnected = connectionStatus === "connected";
  const facts = buildInstanceFacts({
    extensionsInstalledCount: isConnected
      ? extensionsInstalledCount
      : undefined,
    serverInfo,
  });
  const showLiveSkeleton = isConnected && healthPending && !health;
  const privilegedRole = Boolean(
    health?.statsAccess?.superuser ||
      health?.statsAccess?.canExecuteServerProgram ||
      serverInfo?.connectedRoleIsSuperuser ||
      serverInfo?.connectedRoleCanExecuteServerProgram
  );
  const connectedRole =
    health?.statsAccess?.currentUser ||
    serverInfo?.connectedRole ||
    "This role";
  const rows = isConnected
    ? [
        buildConnectedEndpointRow(instance),
        ...buildLiveHealthRows(
          health,
          healthPartialErrors,
          serverInfo?.replicationRole
        ),
      ]
    : buildDisconnectedDiagnosticRows({ connectionStatus, instance });

  return (
    <section aria-label="Health checks">
      <SectionCard
        description={
          isConnected
            ? "Live checks from this instance's system catalogs."
            : "Connection diagnostics from the saved configuration and the last connection attempt."
        }
        title="Health"
      >
        <div className="flex flex-col gap-3">
          {privilegedRole ? (
            <Alert>
              <TriangleAlert />
              <AlertTitle>Privileged PostgreSQL role</AlertTitle>
              <AlertDescription>
                {connectedRole} can bypass parts of read-only containment.
                Read-only transactions do not contain COPY PROGRAM or other
                external side effects. Use a reduced-privilege role without
                superuser or pg_execute_server_program.
              </AlertDescription>
            </Alert>
          ) : null}
          {facts.length > 0 ? (
            <>
              <InstanceFactsHeader facts={facts} />
              <Separator />
            </>
          ) : null}
          {showLiveSkeleton ? (
            <HealthRowsSkeleton />
          ) : (
            <ul className="-mx-2 flex flex-col">
              {rows.map((row) => (
                <InstanceHealthRow key={row.id} row={row} />
              ))}
            </ul>
          )}
        </div>
      </SectionCard>
    </section>
  );
}

export { InstanceHealthSection };
