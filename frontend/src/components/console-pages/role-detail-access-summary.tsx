"use client";

import { ChevronRight, Database, ShieldOff } from "lucide-react";
import type { ComponentType } from "react";
import { SectionCard } from "@/components/console-pages/console-layout";
import type { Section } from "@/components/console-pages/role-detail-model";
import { DatabaseSelect } from "@/components/console-pages/role-grants-tab";
import { Badge } from "@/components/querylane-ui/badge";
import { Button } from "@/components/querylane-ui/button";
import { cn } from "@/lib/utils";
import { isNonEmptyString } from "@/lib/value-guards";

interface AccessSourceRow {
  active: boolean;
  detail: string;
  icon: ComponentType<{ className?: string }>;
  jump?: { label: string; section: Section } | undefined;
  label: string;
  scope: "cluster" | "database";
  status: string;
  tone: "danger" | "active";
}

function accessIconClassName(row: AccessSourceRow) {
  return cn(
    "flex size-8 shrink-0 items-center justify-center rounded-md",
    row.active &&
      row.tone === "danger" &&
      "bg-warning-500/15 text-warning-600 dark:text-warning-400",
    row.active &&
      row.tone === "active" &&
      "bg-positive-500/15 text-positive-600 dark:text-positive-400",
    !row.active && "bg-muted text-muted-foreground/40"
  );
}

function AccessSummaryRow({
  onJump,
  row,
}: {
  onJump: (section: Section) => void;
  row: AccessSourceRow;
}) {
  const { icon: Icon, jump } = row;
  const activePresentation =
    row.tone === "danger" ? "access-warning" : "access-active";
  const inner = (
    <>
      <span className={accessIconClassName(row)}>
        <Icon className="size-4" />
      </span>
      <div className="min-w-0 flex-1 text-left">
        <div className="flex items-center gap-1.5">
          <span
            className={cn(
              "text-sm font-medium",
              !row.active && "text-muted-foreground"
            )}
          >
            {row.label}
          </span>
        </div>
        <p
          className={cn(
            "text-xs leading-snug",
            row.active ? "text-muted-foreground" : "text-muted-foreground/50"
          )}
        >
          {row.detail}
        </p>
      </div>
      <Badge
        className="shrink-0"
        presentation={row.active ? activePresentation : "access-inactive"}
        variant={row.active ? "secondary" : "outline"}
      >
        {row.status}
      </Badge>
      {jump ? (
        <ChevronRight className="size-4 shrink-0 text-muted-foreground/40 transition-colors group-hover:text-foreground" />
      ) : null}
    </>
  );

  const base = cn(
    "flex w-full items-center gap-3 rounded-lg border px-3 py-2.5 text-left",
    row.active ? "border-border bg-muted/30" : "border-dashed border-border/50"
  );

  if (jump) {
    return (
      <Button
        className="group flex h-auto w-full cursor-pointer items-center justify-start text-left"
        onClick={() => {
          onJump(jump.section);
        }}
        presentation={
          row.active ? "access-summary-active" : "access-summary-inactive"
        }
        type="button"
        variant="ghost"
      >
        {inner}
      </Button>
    );
  }
  return <div className={base}>{inner}</div>;
}

function ScopeGroup({
  label,
  onJump,
  rows,
}: {
  label: React.ReactNode;
  onJump: (section: Section) => void;
  rows: AccessSourceRow[];
}) {
  if (rows.length === 0) {
    return null;
  }
  return (
    <div className="flex flex-col gap-2">
      <div className="flex items-center gap-1 px-1 font-medium tracking-wide text-(length:--text-label-sm) text-muted-foreground uppercase">
        {label}
      </div>
      {rows.map((row) => (
        <AccessSummaryRow key={row.label} onJump={onJump} row={row} />
      ))}
    </div>
  );
}

function AccessSummary({
  databaseName,
  databases,
  onJump,
  onSelectDatabase,
  rlsNote,
  rows,
  selectedDatabaseId,
}: {
  databaseName: string | undefined;
  databases: {
    id: string;
    name: string;
  }[];
  onJump: (section: Section) => void;
  onSelectDatabase: (value: string) => void;
  rlsNote: string | null;
  rows: AccessSourceRow[];
  selectedDatabaseId: string | undefined;
}) {
  const clusterRows = rows.filter((row) => row.scope === "cluster");
  const databaseRows = rows.filter((row) => row.scope === "database");
  return (
    <SectionCard
      action={
        databases.length > 0 ? (
          <DatabaseSelect
            databases={databases}
            onChange={onSelectDatabase}
            value={selectedDatabaseId}
          />
        ) : undefined
      }
      description="Every way this role can reach objects."
      title="Access"
    >
      <div className="flex flex-col gap-4">
        <ScopeGroup label="Cluster-wide" onJump={onJump} rows={clusterRows} />
        <ScopeGroup
          label={
            isNonEmptyString(databaseName) ? (
              <>
                In
                <Database
                  aria-hidden="true"
                  className="size-3 shrink-0 text-muted-foreground"
                />
                <span className="font-mono text-foreground normal-case">
                  {databaseName}
                </span>
              </>
            ) : (
              "In the selected database"
            )
          }
          onJump={onJump}
          rows={databaseRows}
        />
      </div>
      {isNonEmptyString(rlsNote) ? (
        <p className="mt-3 flex items-start gap-1.5 text-xs text-muted-foreground">
          <ShieldOff className="mt-0.5 size-3 shrink-0" />
          <span>{rlsNote}</span>
        </p>
      ) : null}
    </SectionCard>
  );
}

export { AccessSummary };
