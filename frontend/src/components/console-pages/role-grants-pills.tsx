"use client";

import { ChevronLeft, KeyRound } from "lucide-react";
import type { ComponentType, ReactNode } from "react";
import {
  dedupePrivileges,
  densityState,
  type GrantedObject,
  type PillState,
  PRIV_TONE_CLASS,
  PRIV_TONE_PARTIAL_CLASS,
  privAbbr,
  privTone,
  privTooltip,
} from "@/components/console-pages/role-grants-shared";
import { EmptyStatePanel } from "@/components/empty-state-panel";
import { Button } from "@/components/ui/button";
import {
  Tooltip,
  TooltipContent,
  TooltipTrigger,
} from "@/components/ui/tooltip";
import { cn } from "@/lib/utils";

const PILL_BASE =
  "inline-flex h-[18px] items-center justify-center gap-0.5 rounded border px-1.5 font-mono text-[10px] leading-none tracking-[0.06em]";

export function AbbrPill({
  count,
  grantable,
  name,
  state,
}: {
  count?: number | undefined;
  grantable?: boolean | undefined;
  name: string;
  state: PillState;
}) {
  const abbr = privAbbr(name);
  const tooltip = grantable
    ? `${privTooltip(name)} · WITH GRANT OPTION`
    : privTooltip(name);
  const tone = privTone(name);
  const className =
    state === "none"
      ? cn(
          PILL_BASE,
          "min-w-[2.75rem] border-border/50 border-dashed text-muted-foreground/40"
        )
      : cn(
          PILL_BASE,
          state === "partial"
            ? PRIV_TONE_PARTIAL_CLASS[tone]
            : PRIV_TONE_CLASS[tone],
          count != null && "min-w-[2.75rem]"
        );
  return (
    <Tooltip>
      <TooltipTrigger render={<span className={className} />}>
        {abbr}
        {state !== "none" && grantable ? (
          <span className="font-bold leading-none">+</span>
        ) : null}
        {state !== "none" && count != null ? (
          <span className="text-[9px] opacity-80">
            {count.toLocaleString()}
          </span>
        ) : null}
      </TooltipTrigger>
      <TooltipContent>{tooltip}</TooltipContent>
    </Tooltip>
  );
}

// Density rollup strip: one pill per column showing full / partial / none.
export function DensityStrip({
  columns,
  counts,
  total,
}: {
  columns: string[];
  counts: Record<string, number>;
  total: number;
}) {
  if (columns.length === 0) {
    return null;
  }
  return (
    <span className="flex flex-wrap items-center justify-end gap-1">
      {columns.map((name) => {
        const count = counts[name] ?? 0;
        const state = densityState(count, total);
        return (
          <AbbrPill
            count={state === "none" ? undefined : count}
            key={name}
            name={name}
            state={state}
          />
        );
      })}
    </span>
  );
}

// Held-only pills (no not-held columns) for flat rows and row detail. Neutral by
// default — colour is reserved for the density rollups where it carries the
// per-schema coverage signal.
export function HeldPillStrip({
  columns,
  object,
}: {
  columns: string[];
  object: GrantedObject;
}) {
  const held = new Map(
    dedupePrivileges(object.privileges).map((p) => [p.name, p.grantable])
  );
  const ordered = columns.filter((name) => held.has(name));
  if (ordered.length === 0) {
    return (
      <span className="font-mono text-[11px] text-muted-foreground/50 italic">
        no privileges
      </span>
    );
  }
  return (
    <span className="flex flex-wrap items-center justify-end gap-1">
      {ordered.map((name) => (
        <AbbrPill
          grantable={held.get(name)}
          key={name}
          name={name}
          state="held"
        />
      ))}
    </span>
  );
}

export function FilterChip({
  active,
  label,
  onToggle,
}: {
  active: boolean;
  label: string;
  onToggle: () => void;
}) {
  return (
    <Button
      aria-pressed={active}
      className="h-[22px] rounded-full px-2 font-mono text-[10px] tracking-[0.06em]"
      onClick={onToggle}
      size="xs"
      type="button"
      variant={active ? "secondary" : "outline"}
    >
      {label}
    </Button>
  );
}

export function CountPill({ value }: { value: number }) {
  return (
    <span className="inline-flex h-[18px] items-center rounded-full border border-border bg-secondary px-[7px] font-medium font-mono text-[11px] text-muted-foreground tracking-[0.02em]">
      {value.toLocaleString()}
    </span>
  );
}

// "← Grants" affordance that returns from a drill-in to the grants overview.
export function BackBar({ onBack }: { onBack: () => void }) {
  return (
    <Button
      className="-ml-1 h-7 gap-1 self-start px-1.5 font-normal text-muted-foreground text-xs"
      onClick={onBack}
      size="sm"
      type="button"
      variant="ghost"
    >
      <ChevronLeft className="size-3.5" />
      Grants
    </Button>
  );
}

// Title row for a drill-in: icon + heading + optional tag/count, with an
// optional grantor meta line below as `sub`.
export function ContentHead({
  count,
  countUnit,
  icon: Icon,
  iconClassName,
  sub,
  tag,
  title,
}: {
  count?: number | undefined;
  countUnit?: string;
  icon: ComponentType<{ className?: string }>;
  iconClassName?: string;
  sub?: ReactNode;
  tag?: ReactNode;
  title: string;
}) {
  return (
    <div className="flex flex-col gap-1.5 pb-3.5">
      <div className="flex flex-wrap items-center gap-2.5">
        <Icon className={cn("size-4 text-muted-foreground", iconClassName)} />
        <h2 className="font-semibold text-xl tracking-tight">{title}</h2>
        {tag}
        {count == null ? null : (
          <span className="inline-flex h-[18px] items-center rounded-full border border-border bg-secondary px-[7px] font-medium font-mono text-[11px] text-muted-foreground tracking-[0.02em]">
            {count.toLocaleString()}
            {countUnit ? (
              <span className="ml-1 font-normal">
                {countUnit}
                {count === 1 ? "" : "s"}
              </span>
            ) : null}
          </span>
        )}
      </div>
      {sub ? <div className="text-muted-foreground text-xs">{sub}</div> : null}
    </div>
  );
}

// Shared dashed empty-state block (overview / Owns / PUBLIC / defaults).
export function GrantsEmptyState({
  children,
  title,
}: {
  children: ReactNode;
  title?: string;
}) {
  return (
    <EmptyStatePanel
      className="min-h-36 rounded-md border-dashed"
      contentClassName="max-w-[520px]"
      description={children}
      icon={KeyRound}
      title={title}
    />
  );
}
