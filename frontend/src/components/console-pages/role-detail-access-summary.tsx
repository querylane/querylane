"use client";
import { ChevronRight, Database, ShieldOff } from "lucide-react";
import type { ComponentType } from "react";
import { SectionCard } from "@/components/console-pages/console-layout";
import type { Section } from "@/components/console-pages/role-detail-model";
import { DatabaseSelect } from "@/components/console-pages/role-grants-tab";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";

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

function accessIconClassName(row: AccessSourceRow): string {
  return cn(
    "flex size-8 shrink-0 items-center justify-center rounded-md",
    row.active &&
      row.tone === "danger" &&
      "bg-amber-500/15 text-amber-600 dark:text-amber-400",
    row.active &&
      row.tone === "active" &&
      "bg-emerald-500/15 text-emerald-600 dark:text-emerald-400",
    !row.active && "bg-muted text-muted-foreground/40"
  );
}

function accessBadgeClassName(row: AccessSourceRow): string {
  return cn(
    "shrink-0 rounded-sm font-medium text-[10.5px] uppercase tabular-nums tracking-wide",
    row.active &&
      row.tone === "danger" &&
      "border-amber-500/30 bg-amber-500/10 text-amber-700 dark:text-amber-400",
    !row.active && "text-muted-foreground/50"
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
  const inner = (
    <>
      <span className={accessIconClassName(row)}>
        <Icon className="size-4" />
      </span>
      <div className="min-w-0 flex-1 text-left">
        <div className="flex items-center gap-1.5">
          <span
            className={cn(
              "font-medium text-sm",
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
        className={accessBadgeClassName(row)}
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
    row.active ? "border-border bg-muted/30" : "border-border/50 border-dashed"
  );

  // Navigable rows are a single full-width click target (Linear/Vercel row
  // pattern) — the count stays a passive value and a hover chevron signals the
  // drill-in. Non-navigable rows render static.
  if (jump) {
    return (
      <Button
        className={cn(
          base,
          "group h-auto w-full cursor-pointer justify-start transition-colors hover:bg-muted/60"
        )}
        onClick={() => onJump(jump.section)}
        type="button"
        variant="ghost"
      >
        {inner}
      </Button>
    );
  }
  return <div className={base}>{inner}</div>;
}

// A scope-labeled group of access rows (cluster-wide vs the selected database).
// The muted sub-header names the database once, replacing per-row "in {db}".
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
      <div className="flex items-center gap-1 px-1 font-medium text-[11px] text-muted-foreground uppercase tracking-wide">
        {label}
      </div>
      {rows.map((row) => (
        <AccessSummaryRow key={row.label} onJump={onJump} row={row} />
      ))}
    </div>
  );
}

// The "no grants != no access" spine: every path by which the role gains access,
// each active or not, with a jump to the relevant detail. Rows are grouped by
// scope — cluster-wide vs the selected database. Built-in pg_* roles get their
// own dedicated layout (see BuiltinRoleBody), so this is only used for ordinary
// roles.
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
  databases: { id: string; name: string }[];
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
            databaseName ? (
              <>
                {"In"}
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
      {rlsNote ? (
        <p className="mt-3 flex items-start gap-1.5 text-muted-foreground text-xs">
          <ShieldOff className="mt-0.5 size-3 shrink-0" />
          <span>{rlsNote}</span>
        </p>
      ) : null}
    </SectionCard>
  );
}

// ─── Built-in (predefined pg_*) role detail ──────────────────────────────────
// A built-in role inverts the normal model: its powers are hard-coded and
// cluster-wide (no catalog ACL to read, can't be revoked), while the only live,
// queryable, security-relevant fact is who holds it. So the layout leads with
// the doc-table powers, makes membership the primary data, and surfaces the
// per-database grant machinery only for privileges an admin GRANTed on top.

export { AccessSummary };
