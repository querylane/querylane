"use client";

import { AlertTriangle, Clipboard, Info, Search, Server } from "lucide-react";
import {
  type FormEvent,
  type ReactNode,
  useEffect,
  useId,
  useRef,
  useState,
} from "react";
import { RetryActionButton } from "@/components/retry-action-button";
import { Button } from "@/components/ui/button";
import { DataTableFacetedFilter } from "@/components/ui/data-table-faceted-filter";
import { Input } from "@/components/ui/input";
import { Skeleton } from "@/components/ui/skeleton";
import { useOtherDatabaseObjectsQuery } from "@/features/data-explorer/other-database-objects-query";
import { cn } from "@/lib/utils";

const OTHER_OBJECT_CATEGORIES = [
  {
    description:
      "Functions and procedures that live in this database. Expand one to read its body, or call it with arguments in the workbench.",
    key: "routines",
    label: "Routines",
  },
  {
    description:
      "Every auto-increment counter, with its current position. Click the owning column to jump to the table — watch for counters approaching their type’s max.",
    key: "sequences",
    label: "Sequences",
  },
  {
    description:
      "Custom enums, composites, domains, and ranges. Enum values are ordered — new values can be added between existing ones, but never removed.",
    key: "types",
    label: "Types",
  },
  {
    description:
      "Text sort orders. After an OS glibc or ICU upgrade, version mismatches here can silently corrupt indexes on text columns.",
    key: "collations",
    label: "Collations",
  },
  {
    description:
      "Connections to other servers, queryable as local tables. Filters are pushed down — only matching rows cross the wire.",
    key: "fdwServers",
    label: "FDW servers",
  },
  {
    description:
      "Publications feeding logical replicas and the WAL senders streaming them. Lag here means replicas are reading stale data.",
    key: "replication",
    label: "Replication",
  },
  {
    description:
      "Fire on DDL, not on rows — this database uses them to log every schema change. Disable one before large migrations if it slows them down.",
    key: "eventTriggers",
    label: "Event triggers",
  },
  {
    description:
      "Cron schedules that run inside Postgres with no external scheduler. Expand a job to inspect its schedule and command.",
    key: "cronJobs",
    label: "Jobs · pg_cron",
  },
] as const;

const MAX_ENUM_CHIPS = 12;
const CRON_FIELD_LABELS = [
  "Minute",
  "Hour",
  "Day of month",
  "Month",
  "Day of week",
] as const;
const CRON_PARTS_RE = /\s+/;
const CRON_NUMBER_RE = /^\d+$/;
const ROUTINE_SIGNATURE_RE = /^([^(]+)(\(.*\))$/;
const CRON_FIELD_COUNT = 5;
const CRON_MINUTE_INDEX = 0;
const CRON_HOUR_INDEX = 1;
const CRON_DAY_OF_MONTH_INDEX = 2;
const CRON_MONTH_INDEX = 3;
const CRON_DAY_OF_WEEK_INDEX = 4;
const INTRO_COPY =
  "Across this database: everything that isn’t a relation, from pg_proc, pg_type, pg_collation, pg_foreign_server, pg_publication, pg_event_trigger";
const ALL_CATEGORIES_DESCRIPTION =
  "Browse routines, sequences, types, collations, foreign servers, replication, event triggers, and pg_cron jobs across this database.";
const COPY_NOTICE_DURATION_MS = 2000;

type OtherObjectCategory = (typeof OTHER_OBJECT_CATEGORIES)[number]["key"];
type OtherObjectCategoryMeta = (typeof OTHER_OBJECT_CATEGORIES)[number];

interface OtherDatabaseObject {
  badge: string;
  category: OtherObjectCategory;
  definition: string;
  detail: string;
  extra?: string | undefined;
  name: string;
  sortKey: string;
  status?: "failed" | "ok" | "warning" | undefined;
  summary: string;
  values?: string[] | undefined;
}

interface OtherDatabaseObjectsPanelProps {
  error?: unknown;
  isLoading: boolean;
  isTruncated?: boolean | undefined;
  objects: OtherDatabaseObject[];
  onRetry?: (() => Promise<unknown>) | undefined;
}

interface OtherObjectCardProps {
  isExpanded: boolean;
  object: OtherDatabaseObject;
  onCopySql: (definition: string) => void;
  onToggle: () => void;
}

function countByCategory(
  objects: OtherDatabaseObject[]
): Record<OtherObjectCategory, number> {
  const counts = Object.fromEntries(
    OTHER_OBJECT_CATEGORIES.map((category) => [category.key, 0])
  ) as Record<OtherObjectCategory, number>;

  for (const object of objects) {
    counts[object.category] += 1;
  }

  return counts;
}

function selectedCategoryMeta(category: OtherObjectCategory) {
  return (
    OTHER_OBJECT_CATEGORIES.find((candidate) => candidate.key === category) ??
    OTHER_OBJECT_CATEGORIES[0]
  );
}

function isOtherObjectCategory(value: string): value is OtherObjectCategory {
  return OTHER_OBJECT_CATEGORIES.some((category) => category.key === value);
}

function resolveSelectedCategory(
  requestedCategories: OtherObjectCategory[],
  presentCategories: OtherObjectCategoryMeta[]
): OtherObjectCategory | undefined {
  if (requestedCategories.length === 0) {
    return;
  }
  const requestedCategory =
    requestedCategories.length === 1 ? requestedCategories[0] : undefined;
  return (
    presentCategories.find((category) => category.key === requestedCategory)
      ?.key ?? presentCategories[0]?.key
  );
}

function preventSearchSubmit(event: FormEvent<HTMLFormElement>) {
  event.preventDefault();
}

function objectMatchesSearch(
  object: OtherDatabaseObject,
  query: string
): boolean {
  const normalizedQuery = query.trim().toLowerCase();
  if (!normalizedQuery) {
    return true;
  }
  return [
    object.name,
    object.badge,
    object.summary,
    object.detail,
    object.definition,
    object.extra ?? "",
  ].some((value) => value.toLowerCase().includes(normalizedQuery));
}

function objectKey(object: OtherDatabaseObject): string {
  return `${object.category}:${object.name}`;
}

function enumChips(object: OtherDatabaseObject): string[] {
  if (object.category !== "types" || object.badge !== "ENUM") {
    return [];
  }
  return (object.values ?? []).slice(0, MAX_ENUM_CHIPS);
}

function assertNeverStatus(_status: never): never {
  throw new Error("Unexpected object status");
}

function statusLabel(status: OtherDatabaseObject["status"]) {
  switch (status) {
    case "failed":
      return "failed";
    case "ok":
      return "ok";
    case "warning":
      return "warning";
    case undefined:
      return "";
    default:
      return assertNeverStatus(status);
  }
}

function statusClassName(status: OtherDatabaseObject["status"]) {
  switch (status) {
    case "failed":
      return "text-destructive";
    case "ok":
      return "text-emerald-600 dark:text-emerald-400";
    case "warning":
      return "text-amber-600 dark:text-amber-400";
    case undefined:
      return "";
    default:
      return assertNeverStatus(status);
  }
}

function ObjectStatus({ status }: { status?: OtherDatabaseObject["status"] }) {
  if (!status) {
    return null;
  }

  return (
    <span
      className={cn(
        "inline-flex items-center gap-1 font-mono text-[11px]",
        statusClassName(status)
      )}
    >
      <span aria-hidden="true" className="size-1.5 rounded-full bg-current" />
      {statusLabel(status)}
    </span>
  );
}

function ObjectBadge({ children }: { children: ReactNode }) {
  return (
    <span className="rounded-full border border-border bg-muted px-2 py-0.5 font-medium text-[10px] text-muted-foreground uppercase tracking-wide">
      {children}
    </span>
  );
}

function CardSummaryButton({
  children,
  isExpanded,
  onToggle,
}: {
  children: ReactNode;
  isExpanded: boolean;
  onToggle: () => void;
}) {
  return (
    <Button
      aria-expanded={isExpanded}
      className="h-auto w-full flex-col items-stretch justify-start gap-0 whitespace-normal rounded-none p-0 text-left hover:bg-transparent aria-expanded:bg-transparent dark:hover:bg-transparent"
      onClick={onToggle}
      type="button"
      variant="ghost"
    >
      {children}
    </Button>
  );
}

function ObjectDefinition({
  extra,
  object,
  onCopySql,
}: {
  extra?: ReactNode;
  object: OtherDatabaseObject;
  onCopySql: (definition: string) => void;
}) {
  if (!object.definition) {
    return null;
  }

  return (
    <div className="mt-3 border-border border-t pt-3">
      <pre className="whitespace-pre-wrap break-words rounded-lg bg-muted/70 p-3 font-mono text-[12px] leading-6">
        <code>{object.definition}</code>
      </pre>
      <div className="mt-3 flex flex-wrap items-center gap-3">
        <Button
          className="h-7"
          onClick={() => onCopySql(object.definition)}
          size="xs"
          type="button"
          variant="outline"
        >
          <Clipboard data-icon="inline-start" />
          Copy SQL
        </Button>
        {extra}
      </div>
    </div>
  );
}

function TypeObjectCard({
  isExpanded,
  object,
  onCopySql,
  onToggle,
}: OtherObjectCardProps) {
  const chips = enumChips(object);
  const isEnum = chips.length > 0;
  const hiddenChipCount = Math.max(
    0,
    (object.values?.length ?? 0) - chips.length
  );

  return (
    <article className="rounded-[10px] border border-border bg-card p-3 transition-colors hover:border-ring">
      <CardSummaryButton isExpanded={isExpanded} onToggle={onToggle}>
        <div className="flex flex-wrap items-center gap-2">
          <span className="font-mono font-semibold text-[13px]">
            {object.name}
          </span>
          {object.badge ? <ObjectBadge>{object.badge}</ObjectBadge> : null}
        </div>
        {isEnum ? (
          <ol className="mt-3 flex flex-wrap gap-1.5">
            {chips.map((chip, index) => (
              <li
                className="inline-flex h-6 items-center gap-1.5 rounded-full border border-border bg-muted/60 px-2.5 font-mono text-[11px]"
                key={`${object.name}-${chip}`}
              >
                <span className="text-[10px] text-muted-foreground">
                  {index + 1}
                </span>
                {chip}
              </li>
            ))}
            {hiddenChipCount > 0 ? (
              <li className="inline-flex h-6 items-center rounded-full border border-border px-2.5 text-[11px] text-muted-foreground">
                +{hiddenChipCount} more
              </li>
            ) : null}
          </ol>
        ) : (
          <div className="mt-2 font-mono text-[12px] text-muted-foreground">
            {object.summary || object.detail}
          </div>
        )}
      </CardSummaryButton>
      {isExpanded ? (
        <ObjectDefinition
          extra={
            object.extra ? (
              <span className="text-[11px] text-muted-foreground">
                {object.extra}
              </span>
            ) : null
          }
          object={object}
          onCopySql={onCopySql}
        />
      ) : null}
    </article>
  );
}

function RoutineObjectCard(props: OtherObjectCardProps) {
  const { isExpanded, object, onCopySql, onToggle } = props;
  const signature = object.name.match(ROUTINE_SIGNATURE_RE);
  const routineName = signature?.[1] ?? object.name;
  const routineArgs = signature?.[2] ?? "";
  const summaryParts = object.summary.split(" · ").filter(Boolean);
  const hasReturnType = object.badge !== "PROCEDURE" && summaryParts.length > 0;
  const returnType = hasReturnType ? summaryParts[0] : undefined;
  const metadata = hasReturnType ? summaryParts.slice(1) : summaryParts;

  return (
    <article className="rounded-[10px] border border-border bg-card p-3 transition-colors hover:border-ring">
      <CardSummaryButton isExpanded={isExpanded} onToggle={onToggle}>
        <div className="font-mono text-[12px] leading-5">
          <span className="font-bold">{routineName}</span>
          <span className="text-muted-foreground">{routineArgs}</span>
          {returnType ? (
            <span className="text-primary"> → {returnType}</span>
          ) : null}
        </div>
        <div className="mt-2 flex flex-wrap items-center gap-1.5">
          {object.badge ? <ObjectBadge>{object.badge}</ObjectBadge> : null}
          {metadata.map((part) => (
            <ObjectBadge key={part}>{part}</ObjectBadge>
          ))}
        </div>
        {object.detail ? (
          <p className="mt-2 text-[12px] text-muted-foreground leading-5">
            {object.detail}
          </p>
        ) : null}
      </CardSummaryButton>
      {isExpanded ? (
        <ObjectDefinition object={object} onCopySql={onCopySql} />
      ) : null}
    </article>
  );
}

function SequenceObjectCard(props: OtherObjectCardProps) {
  const { isExpanded, object, onCopySql, onToggle } = props;
  const summaryParts = object.summary.split(" · ").filter(Boolean);

  return (
    <article className="rounded-[10px] border border-border bg-card p-3 transition-colors hover:border-ring">
      <CardSummaryButton isExpanded={isExpanded} onToggle={onToggle}>
        <div className="truncate font-mono font-semibold text-[12px]">
          {object.name}
        </div>
        <div className="mt-2 font-bold font-mono text-lg">
          {summaryParts[0]?.replace("last ", "") || "—"}
        </div>
        <div className="text-[10px] text-muted-foreground uppercase tracking-wide">
          Last value
        </div>
        {summaryParts.length > 1 ? (
          <p className="mt-2 text-[11px] text-muted-foreground">
            {summaryParts.slice(1).join(" · ")}
          </p>
        ) : null}
      </CardSummaryButton>
      {isExpanded ? (
        <ObjectDefinition object={object} onCopySql={onCopySql} />
      ) : null}
    </article>
  );
}

function SimpleObjectCard(props: OtherObjectCardProps) {
  const { isExpanded, object, onCopySql, onToggle } = props;

  return (
    <article className="rounded-[10px] border border-border bg-card p-3 transition-colors hover:border-ring">
      <CardSummaryButton isExpanded={isExpanded} onToggle={onToggle}>
        <div className="flex flex-wrap items-center gap-2">
          <span className="font-mono font-semibold text-[13px]">
            {object.name}
          </span>
          {object.badge ? <ObjectBadge>{object.badge}</ObjectBadge> : null}
          <ObjectStatus status={object.status} />
        </div>
        {object.summary ? (
          <p className="mt-2 font-mono text-[12px] text-muted-foreground leading-5">
            {object.summary}
          </p>
        ) : null}
        {object.detail ? (
          <p className="mt-1 text-[12px] text-muted-foreground leading-5">
            {object.detail}
          </p>
        ) : null}
      </CardSummaryButton>
      {isExpanded ? (
        <ObjectDefinition object={object} onCopySql={onCopySql} />
      ) : null}
    </article>
  );
}

function FdwObjectCard(props: OtherObjectCardProps) {
  const { isExpanded, object, onCopySql, onToggle } = props;

  return (
    <article className="rounded-[10px] border border-border bg-card p-3 transition-colors hover:border-ring">
      <div className="flex items-start gap-3">
        <Server className="mt-0.5 size-5 shrink-0 text-muted-foreground" />
        <div className="min-w-0 flex-1">
          <CardSummaryButton isExpanded={isExpanded} onToggle={onToggle}>
            <div className="flex flex-wrap items-center gap-2">
              <span className="font-mono font-semibold text-[13px]">
                {object.name}
              </span>
              {object.badge ? <ObjectBadge>{object.badge}</ObjectBadge> : null}
            </div>
            {object.summary ? (
              <p className="mt-2 text-[12px] text-muted-foreground leading-5">
                {object.summary}
              </p>
            ) : null}
            {object.detail ? (
              <p className="mt-1 text-[12px] text-muted-foreground leading-5">
                {object.detail}
              </p>
            ) : null}
          </CardSummaryButton>
          {isExpanded ? (
            <ObjectDefinition object={object} onCopySql={onCopySql} />
          ) : null}
        </div>
      </div>
    </article>
  );
}

function EventTriggerObjectCard(props: OtherObjectCardProps) {
  const { isExpanded, object, onCopySql, onToggle } = props;

  return (
    <article className="rounded-[10px] border border-border bg-card p-3 transition-colors hover:border-ring">
      <CardSummaryButton isExpanded={isExpanded} onToggle={onToggle}>
        <div className="flex flex-wrap items-center gap-2">
          <ObjectStatus status={object.status} />
          <span className="font-mono font-semibold text-[13px]">
            {object.name}
          </span>
          {object.badge ? <ObjectBadge>{object.badge}</ObjectBadge> : null}
          {object.detail ? (
            <span className="ml-auto font-mono text-[11px] text-muted-foreground">
              {object.detail}
            </span>
          ) : null}
        </div>
        {object.summary ? (
          <p className="mt-2 text-[12px] text-muted-foreground leading-5">
            {object.summary}
          </p>
        ) : null}
      </CardSummaryButton>
      {isExpanded ? (
        <ObjectDefinition object={object} onCopySql={onCopySql} />
      ) : null}
    </article>
  );
}

function cronSchedule(object: OtherDatabaseObject): string {
  return object.summary.split(" · ")[0]?.trim() || object.name;
}

function cronHuman(object: OtherDatabaseObject): string {
  const schedule = cronSchedule(object);
  const parts = schedule.split(CRON_PARTS_RE);
  const minute = parts[0];
  const hour = parts[1];
  const dayOfMonth = parts[2];
  const month = parts[3];
  const dayOfWeek = parts[4];

  if (
    minute?.startsWith("*/") &&
    hour === "*" &&
    dayOfMonth === "*" &&
    month === "*" &&
    dayOfWeek === "*"
  ) {
    return `every ${minute.slice(2)} minutes`;
  }
  if (
    minute &&
    hour &&
    CRON_NUMBER_RE.test(minute) &&
    CRON_NUMBER_RE.test(hour) &&
    dayOfMonth === "*" &&
    month === "*" &&
    dayOfWeek === "0"
  ) {
    return `Sundays at ${hour.padStart(2, "0")}:${minute.padStart(2, "0")}`;
  }
  if (
    minute &&
    hour &&
    CRON_NUMBER_RE.test(minute) &&
    CRON_NUMBER_RE.test(hour) &&
    dayOfMonth === "*" &&
    month === "*" &&
    dayOfWeek === "*"
  ) {
    return `daily at ${hour.padStart(2, "0")}:${minute.padStart(2, "0")}`;
  }
  return schedule;
}

function cronFieldText(value: string, index: number): string {
  if (value === "*") {
    if (index === CRON_DAY_OF_MONTH_INDEX) {
      return "every day of month";
    }
    if (index === CRON_MONTH_INDEX) {
      return "every month";
    }
    if (index === CRON_DAY_OF_WEEK_INDEX) {
      return "every day of week";
    }
    return "every value";
  }
  if (value.startsWith("*/")) {
    return `every ${value.slice(2)}`;
  }
  if (index === CRON_MINUTE_INDEX) {
    return `at minute ${value}`;
  }
  if (index === CRON_HOUR_INDEX) {
    return `at hour ${value}`;
  }
  return `value ${value}`;
}

function cronSentence(schedule: string): string {
  const [minute, hour, dayOfMonth, month, dayOfWeek] =
    schedule.split(CRON_PARTS_RE);
  if (
    minute?.startsWith("*/") &&
    hour === "*" &&
    dayOfMonth === "*" &&
    month === "*" &&
    dayOfWeek === "*"
  ) {
    return `Every ${minute.slice(2)} minutes`;
  }
  if (
    minute &&
    hour &&
    CRON_NUMBER_RE.test(minute) &&
    CRON_NUMBER_RE.test(hour) &&
    dayOfMonth === "*" &&
    month === "*" &&
    dayOfWeek === "*"
  ) {
    return `At ${hour.padStart(2, "0")}:${minute.padStart(2, "0")}, every day`;
  }
  if (
    minute &&
    hour &&
    CRON_NUMBER_RE.test(minute) &&
    CRON_NUMBER_RE.test(hour) &&
    dayOfMonth === "*" &&
    month === "*" &&
    dayOfWeek === "0"
  ) {
    return `At ${hour.padStart(2, "0")}:${minute.padStart(2, "0")}, Sundays`;
  }
  return schedule;
}

function CronObjectCard(props: OtherObjectCardProps) {
  const { isExpanded, object, onCopySql, onToggle } = props;
  const schedule = cronSchedule(object);
  const fields = schedule.split(CRON_PARTS_RE).slice(0, CRON_FIELD_COUNT);

  return (
    <article
      className={cn(
        "rounded-[10px] border bg-card p-3 transition-colors hover:border-ring",
        object.status === "failed" ? "border-destructive/45" : "border-border"
      )}
    >
      <CardSummaryButton isExpanded={isExpanded} onToggle={onToggle}>
        <div className="flex items-center gap-4">
          <div className="w-28 shrink-0">
            <div className="font-bold font-mono text-[13px]">{schedule}</div>
            <div
              className="mt-0.5 text-[11px] text-muted-foreground"
              data-testid="schedule-description"
            >
              {cronHuman(object)}
            </div>
          </div>
          <div className="min-w-0 flex-1">
            <div className="font-mono font-semibold text-[13px]">
              {object.name}
            </div>
            <div className="mt-1 truncate font-mono text-[11px] text-muted-foreground">
              {object.detail}
            </div>
          </div>
          <div className="flex shrink-0 items-center gap-2">
            <ObjectStatus status={object.status} />
            {object.extra ? (
              <span
                className={cn(
                  "font-mono text-[11px]",
                  object.status === "failed"
                    ? "text-destructive"
                    : "text-muted-foreground"
                )}
              >
                {object.extra}
              </span>
            ) : null}
          </div>
        </div>
      </CardSummaryButton>
      {isExpanded ? (
        <div className="mt-3 border-border border-t pt-3">
          <div className="grid grid-cols-5 gap-2">
            {fields.map((field, index) => (
              <div
                className={cn(
                  "rounded-lg border p-2 text-center",
                  field === "*"
                    ? "border-border bg-muted/60"
                    : "border-primary/40 bg-primary/10"
                )}
                key={`${object.name}-${CRON_FIELD_LABELS[index]}`}
              >
                <div className="font-bold font-mono text-base">{field}</div>
                <div className="mt-1 text-[10px] text-muted-foreground uppercase tracking-wide">
                  {CRON_FIELD_LABELS[index]}
                </div>
                <div className="mt-1 text-[10px] text-muted-foreground leading-4">
                  {cronFieldText(field, index)}
                </div>
              </div>
            ))}
          </div>
          <div className="mt-3 flex flex-wrap items-baseline gap-2">
            <span className="font-semibold text-sm">
              “{cronSentence(schedule)}”
            </span>
          </div>
          <ObjectDefinition object={object} onCopySql={onCopySql} />
        </div>
      ) : null}
    </article>
  );
}

function OtherObjectCard(props: OtherObjectCardProps) {
  switch (props.object.category) {
    case "collations":
    case "replication":
      return <SimpleObjectCard {...props} />;
    case "cronJobs":
      return <CronObjectCard {...props} />;
    case "eventTriggers":
      return <EventTriggerObjectCard {...props} />;
    case "fdwServers":
      return <FdwObjectCard {...props} />;
    case "routines":
      return <RoutineObjectCard {...props} />;
    case "sequences":
      return <SequenceObjectCard {...props} />;
    case "types":
      return <TypeObjectCard {...props} />;
    default:
      return assertNeverCategory(props.object.category);
  }
}

function assertNeverCategory(_category: never): never {
  throw new Error("Unexpected other database object category");
}

function gridClassName(category: OtherObjectCategory) {
  switch (category) {
    case "collations":
    case "replication":
    case "routines":
      return "grid gap-2 lg:grid-cols-2";
    case "sequences":
      return "grid gap-2 lg:grid-cols-3";
    case "cronJobs":
    case "eventTriggers":
    case "fdwServers":
    case "types":
      return "space-y-2";
    default:
      return assertNeverCategory(category);
  }
}

function OtherObjectCards({
  category,
  expandedObjectKey,
  objects,
  onCopySql,
  onToggle,
}: {
  category: OtherObjectCategory;
  expandedObjectKey: string | null;
  objects: OtherDatabaseObject[];
  onCopySql: (definition: string) => void;
  onToggle: (key: string) => void;
}) {
  return (
    <div className={gridClassName(category)}>
      {objects.map((object) => {
        const key = objectKey(object);
        return (
          <OtherObjectCard
            isExpanded={expandedObjectKey === key}
            key={key}
            object={object}
            onCopySql={onCopySql}
            onToggle={() => onToggle(key)}
          />
        );
      })}
    </div>
  );
}

function OtherObjectsLoading() {
  return (
    <div
      aria-label="Loading other database objects"
      className="space-y-2"
      role="status"
    >
      <Skeleton className="h-20 w-full rounded-xl" />
      <Skeleton className="h-20 w-full rounded-xl" />
      <Skeleton className="h-20 w-full rounded-xl" />
    </div>
  );
}

function OtherObjectsFiltersLoading() {
  return (
    <>
      <div aria-hidden="true" className="flex min-w-0 items-center gap-2">
        <Skeleton className="h-8 min-w-0 flex-1 sm:max-w-64" />
        <Skeleton className="h-8 w-28 shrink-0" />
      </div>
      <Skeleton className="mt-3 h-[38px] w-full rounded-[9px]" />
    </>
  );
}

function OtherObjectsFilters({
  categoryDescription,
  counts,
  isLoading,
  onCategoryChange,
  onQueryChange,
  presentCategories,
  query,
  selectedCategories,
}: {
  categoryDescription: string;
  counts: Record<OtherObjectCategory, number>;
  isLoading: boolean;
  onCategoryChange: (categories: OtherObjectCategory[]) => void;
  onQueryChange: (query: string) => void;
  presentCategories: OtherObjectCategoryMeta[];
  query: string;
  selectedCategories: OtherObjectCategory[];
}) {
  if (isLoading) {
    return <OtherObjectsFiltersLoading />;
  }

  return (
    <>
      <form
        aria-label="Filter other database objects"
        className="flex min-w-0 items-center gap-2"
        onSubmit={preventSearchSubmit}
      >
        <div className="relative min-w-0 flex-1 sm:max-w-64">
          <Search className="pointer-events-none absolute top-1/2 left-2.5 size-3.5 -translate-y-1/2 text-muted-foreground" />
          <Input
            aria-label="Search other database objects"
            className="h-8 pl-8 text-sm"
            onChange={(event) => onQueryChange(event.target.value)}
            placeholder="Search objects…"
            type="search"
            value={query}
          />
        </div>
        {presentCategories.length > 0 ? (
          <DataTableFacetedFilter
            onSelectedValuesChange={(values) =>
              onCategoryChange(values.filter(isOtherObjectCategory))
            }
            options={presentCategories.map((category) => ({
              count: counts[category.key],
              label: category.label,
              value: category.key,
            }))}
            selectedValues={selectedCategories}
            singleSelect={true}
            title="Category"
          />
        ) : null}
      </form>

      {presentCategories.length > 0 ? (
        <div className="mt-3 flex items-center gap-2 rounded-[9px] border border-border bg-muted/40 px-3 py-2">
          <Info className="size-3.5 shrink-0 text-muted-foreground" />
          <p className="min-w-0 flex-1 text-[12px] text-muted-foreground leading-5">
            {categoryDescription}
          </p>
        </div>
      ) : null}
    </>
  );
}

function OtherObjectsError({
  onRetry,
}: {
  onRetry?: (() => Promise<unknown>) | undefined;
}) {
  return (
    <div className="rounded-xl border border-destructive/30 bg-destructive/5 p-4 text-sm">
      <div className="flex items-start gap-2 text-destructive">
        <AlertTriangle className="mt-0.5 size-4 shrink-0" />
        <span>Failed to load other database objects.</span>
      </div>
      {onRetry ? (
        <RetryActionButton
          className="mt-3"
          label="Retry"
          onRetry={onRetry}
          size="xs"
          variant="outline"
        />
      ) : null}
    </div>
  );
}

function OtherObjectsEmptyState({
  hasActiveFilters,
  hasMatchesInOtherCategories,
}: {
  hasActiveFilters: boolean;
  hasMatchesInOtherCategories: boolean;
}) {
  let description: string | undefined;
  let title = "None in this database.";

  if (hasMatchesInOtherCategories) {
    title = "Matches exist in other categories.";
    description =
      "Choose a category with matches or clear the category filter.";
  } else if (hasActiveFilters) {
    title = "No objects match your filters.";
    description = "Clear the search or category filter to see more objects.";
  }

  return (
    <div className="rounded-[10px] border border-border border-dashed p-6 text-center text-muted-foreground text-sm">
      <p>{title}</p>
      {description ? <p className="mt-1 text-xs">{description}</p> : null}
    </div>
  );
}

function OtherDatabaseObjectsPanel({
  error,
  isLoading,
  isTruncated = false,
  objects,
  onRetry,
}: OtherDatabaseObjectsPanelProps) {
  const titleId = useId();
  const [requestedCategories, setRequestedCategories] = useState<
    OtherObjectCategory[]
  >([]);
  const [query, setQuery] = useState("");
  const [expandedObjectKey, setExpandedObjectKey] = useState<string | null>(
    null
  );
  const [copyNotice, setCopyNotice] = useState("");
  const copyNoticeTimeout = useRef<number | undefined>(undefined);
  const searchedObjects = objects.filter((object) =>
    objectMatchesSearch(object, query)
  );
  const counts = countByCategory(searchedObjects);
  const presentCategories = OTHER_OBJECT_CATEGORIES.filter((category) =>
    objects.some((object) => object.category === category.key)
  );
  const selectedCategory = resolveSelectedCategory(
    requestedCategories,
    presentCategories
  );
  const selectedCategories = selectedCategory ? [selectedCategory] : [];
  const categoryDescription = selectedCategory
    ? selectedCategoryMeta(selectedCategory).description
    : ALL_CATEGORIES_DESCRIPTION;
  const visibleObjects = searchedObjects
    .filter(
      (object) =>
        selectedCategory === undefined || object.category === selectedCategory
    )
    .sort((left, right) => left.sortKey.localeCompare(right.sortKey));
  const hasActiveFilters =
    query.trim().length > 0 || selectedCategory !== undefined;
  const hasMatchesInOtherCategories =
    visibleObjects.length === 0 &&
    selectedCategory !== undefined &&
    searchedObjects.some((object) => object.category !== selectedCategory);

  useEffect(function clearCopyNoticeTimeoutOnUnmount() {
    return () => window.clearTimeout(copyNoticeTimeout.current);
  }, []);

  const showCopyNotice = (notice: string) => {
    window.clearTimeout(copyNoticeTimeout.current);
    setCopyNotice(notice);
    copyNoticeTimeout.current = window.setTimeout(
      () => setCopyNotice(""),
      COPY_NOTICE_DURATION_MS
    );
  };

  const copySql = (definition: string) => {
    let copyRequest: Promise<void> | undefined;
    try {
      copyRequest = navigator.clipboard?.writeText(definition);
    } catch {
      showCopyNotice("Could not copy SQL.");
      return;
    }
    if (!copyRequest) {
      showCopyNotice("Could not copy SQL.");
      return;
    }
    copyRequest
      .then(() => showCopyNotice("SQL copied."))
      .catch(() => showCopyNotice("Could not copy SQL."));
  };

  const toggleObject = (key: string) =>
    setExpandedObjectKey(expandedObjectKey === key ? null : key);

  let objectListContent: ReactNode;
  if (error) {
    objectListContent = <OtherObjectsError onRetry={onRetry} />;
  } else if (isLoading) {
    objectListContent = <OtherObjectsLoading />;
  } else if (visibleObjects.length > 0) {
    objectListContent = selectedCategory ? (
      <OtherObjectCards
        category={selectedCategory}
        expandedObjectKey={expandedObjectKey}
        objects={visibleObjects}
        onCopySql={copySql}
        onToggle={toggleObject}
      />
    ) : (
      <div className="space-y-5">
        {OTHER_OBJECT_CATEGORIES.map((category) => {
          const categoryObjects = visibleObjects.filter(
            (object) => object.category === category.key
          );
          if (categoryObjects.length === 0) {
            return null;
          }
          return (
            <section
              aria-labelledby={`${titleId}-${category.key}`}
              key={category.key}
            >
              <div className="mb-2 flex items-center gap-2">
                <h3
                  className="font-medium text-sm"
                  id={`${titleId}-${category.key}`}
                >
                  {category.label}
                </h3>
                <span className="font-mono text-muted-foreground text-xs tabular-nums">
                  {categoryObjects.length}
                </span>
              </div>
              <OtherObjectCards
                category={category.key}
                expandedObjectKey={expandedObjectKey}
                objects={categoryObjects}
                onCopySql={copySql}
                onToggle={toggleObject}
              />
            </section>
          );
        })}
      </div>
    );
  } else {
    objectListContent = (
      <OtherObjectsEmptyState
        hasActiveFilters={hasActiveFilters}
        hasMatchesInOtherCategories={hasMatchesInOtherCategories}
      />
    );
  }

  return (
    <section
      aria-labelledby={titleId}
      className="overflow-hidden rounded-[14px] border border-border bg-card text-card-foreground shadow-xs"
    >
      <header className="p-4">
        <h2 className="font-semibold text-sm" id={titleId}>
          Other database objects
        </h2>
        <p className="mt-2 text-muted-foreground text-xs">{INTRO_COPY}</p>
      </header>

      <div className="min-h-72 border-border border-t p-4">
        {error ? null : (
          <OtherObjectsFilters
            categoryDescription={categoryDescription}
            counts={counts}
            isLoading={isLoading}
            onCategoryChange={(categories) => {
              setRequestedCategories(categories);
              setExpandedObjectKey(null);
            }}
            onQueryChange={(nextQuery) => {
              setQuery(nextQuery);
              setExpandedObjectKey(null);
            }}
            presentCategories={presentCategories}
            query={query}
            selectedCategories={selectedCategories}
          />
        )}

        {copyNotice ? (
          <p className="mt-3 text-muted-foreground text-sm" role="status">
            {copyNotice}
          </p>
        ) : null}

        {isTruncated ? (
          <p className="mt-3 text-amber-700 text-xs dark:text-amber-300">
            This database has more than 1,000 other objects. Showing a partial
            inventory.
          </p>
        ) : null}

        <div className="mt-3">{objectListContent}</div>
      </div>
    </section>
  );
}

function OtherDatabaseObjectsSection({
  databaseId,
  instanceId,
}: {
  databaseId: string;
  instanceId: string;
}) {
  const query = useOtherDatabaseObjectsQuery({ databaseId, instanceId });

  if (query.data && !query.error && query.data.objects.length === 0) {
    return null;
  }

  return (
    <OtherDatabaseObjectsPanel
      error={query.error}
      isLoading={query.isLoading}
      isTruncated={query.data?.isTruncated}
      objects={query.data?.objects ?? []}
      onRetry={() => query.refetch()}
    />
  );
}

export type { OtherDatabaseObject, OtherObjectCategory };
export { OtherDatabaseObjectsPanel, OtherDatabaseObjectsSection };
