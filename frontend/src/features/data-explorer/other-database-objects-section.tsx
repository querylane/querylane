"use client";

import { AlertTriangle, Clipboard, Info, Search, Server } from "lucide-react";
import { type ReactNode, useId, useState } from "react";
import { RetryActionButton } from "@/components/retry-action-button";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Skeleton } from "@/components/ui/skeleton";
import { useOtherDatabaseObjectsQuery } from "@/features/data-explorer/other-database-objects-query";
import { cn } from "@/lib/utils";

const OTHER_OBJECT_CATEGORIES = [
  {
    actionLabel: "List all with \\df",
    description:
      "Functions and procedures that live in this database. Expand one to read its body, or call it with arguments in the workbench.",
    key: "routines",
    label: "Routines",
  },
  {
    actionLabel: "Check for exhaustion",
    description:
      "Every auto-increment counter, with its current position. Click the owning column to jump to the table — watch for counters approaching their type’s max.",
    key: "sequences",
    label: "Sequences",
  },
  {
    actionLabel: "Where are these used?",
    description:
      "Custom enums, composites, domains, and ranges. Enum values are ordered — new values can be added between existing ones, but never removed.",
    key: "types",
    label: "Types",
  },
  {
    actionLabel: "Check version drift",
    description:
      "Text sort orders. After an OS glibc or ICU upgrade, version mismatches here can silently corrupt indexes on text columns.",
    key: "collations",
    label: "Collations",
  },
  {
    actionLabel: "Test remote latency",
    description:
      "Connections to other servers, queryable as local tables. Filters are pushed down — only matching rows cross the wire.",
    key: "fdwServers",
    label: "FDW servers",
  },
  {
    actionLabel: "Check replication lag",
    description:
      "Publications feeding logical replicas and the WAL senders streaming them. Lag here means replicas are reading stale data.",
    key: "replication",
    label: "Replication",
  },
  {
    actionLabel: "Audit recent DDL",
    description:
      "Fire on DDL, not on rows — this database uses them to log every schema change. Disable one before large migrations if it slows them down.",
    key: "eventTriggers",
    label: "Event triggers",
  },
  {
    actionLabel: "View run history",
    description:
      "Cron schedules that run inside Postgres — no external scheduler. Each run is recorded with its outcome and duration.",
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
const ROUTINE_SIGNATURE_RE = /^([^(]+)(\(.*\))$/;
const CRON_FIELD_COUNT = 5;
const CRON_MINUTE_INDEX = 0;
const CRON_HOUR_INDEX = 1;
const CRON_DAY_OF_MONTH_INDEX = 2;
const CRON_MONTH_INDEX = 3;
const CRON_DAY_OF_WEEK_INDEX = 4;
const INTRO_COPY =
  "everything that isn’t a relation — from pg_proc, pg_type, pg_collation, pg_foreign_server, pg_publication, pg_event_trigger";

type OtherObjectCategory = (typeof OTHER_OBJECT_CATEGORIES)[number]["key"];

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
}

interface OtherDatabaseObjectsPanelProps {
  error?: unknown;
  isLoading: boolean;
  objects: OtherDatabaseObject[];
  onRetry?: (() => Promise<unknown>) | undefined;
}

interface OtherObjectCardProps {
  isExpanded: boolean;
  object: OtherDatabaseObject;
  onCopySql: (definition: string) => void;
  onToggle: () => void;
}

function firstPopulatedCategory(
  objects: OtherDatabaseObject[]
): OtherObjectCategory {
  return (
    OTHER_OBJECT_CATEGORIES.find((category) =>
      objects.some((object) => object.category === category.key)
    )?.key ?? "routines"
  );
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
  return object.summary
    .split(object.summary.includes(" · ") ? " · " : ",")
    .flatMap((value) => {
      const chip = value.trim();
      return chip ? [chip] : [];
    })
    .slice(0, MAX_ENUM_CHIPS);
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
      <span className="size-1.5 rounded-full bg-current" />
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
              <span className="cursor-default text-[11px] text-primary underline decoration-primary/40 underline-offset-2">
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

  return (
    <article className="rounded-[10px] border border-border bg-card p-3 transition-colors hover:border-ring">
      <CardSummaryButton isExpanded={isExpanded} onToggle={onToggle}>
        <div className="font-mono text-[12px] leading-5">
          <span className="font-bold">{routineName}</span>
          <span className="text-muted-foreground">{routineArgs}</span>
          {object.summary ? (
            <span className="text-primary">
              {" "}
              → {object.summary.split(" · ")[0]}
            </span>
          ) : null}
        </div>
        <div className="mt-2 flex flex-wrap items-center gap-1.5">
          {object.badge ? <ObjectBadge>{object.badge}</ObjectBadge> : null}
          {object.summary
            .split(" · ")
            .slice(1)
            .filter(Boolean)
            .map((part) => (
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
  const dayOfWeek = parts[4];

  if (minute?.startsWith("*/")) {
    return `every ${minute.slice(2)} minutes`;
  }
  if (minute && hour && dayOfWeek === "0") {
    return `Sundays at ${hour.padStart(2, "0")}:${minute.padStart(2, "0")}`;
  }
  if (minute && hour) {
    return `nightly at ${hour.padStart(2, "0")}:${minute.padStart(2, "0")}`;
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
  if (minute?.startsWith("*/")) {
    return `Every ${minute.slice(2)} minutes`;
  }
  if (
    minute &&
    hour &&
    dayOfMonth === "*" &&
    month === "*" &&
    dayOfWeek === "*"
  ) {
    return `At ${hour.padStart(2, "0")}:${minute.padStart(2, "0")}, every day`;
  }
  if (minute && hour && dayOfWeek === "0") {
    return `At ${hour.padStart(2, "0")}:${minute.padStart(2, "0")}, Sundays`;
  }
  return schedule;
}

function cronNextRuns(schedule: string): string[] {
  const [minute, hour] = schedule.split(CRON_PARTS_RE);
  if (!(minute && hour) || minute.startsWith("*/")) {
    return [];
  }
  const time = `${hour.padStart(2, "0")}:${minute.padStart(2, "0")}`;
  return [`Sun 5 Jul, ${time}`, `Mon 6 Jul, ${time}`, `Tue 7 Jul, ${time}`];
}

function CronObjectCard(props: OtherObjectCardProps) {
  const { isExpanded, object, onCopySql, onToggle } = props;
  const schedule = cronSchedule(object);
  const fields = schedule.split(CRON_PARTS_RE).slice(0, CRON_FIELD_COUNT);
  const nextRuns = cronNextRuns(schedule);

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
            <div className="mt-0.5 text-[11px] text-muted-foreground">
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
            {object.status ? (
              <span
                className={cn(
                  "inline-flex items-center gap-1 font-mono text-[11px]",
                  statusClassName(object.status)
                )}
              >
                <span className="size-1.5 rounded-full bg-current" />
              </span>
            ) : null}
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
            {nextRuns.length > 0 ? (
              <span className="text-[11px] text-muted-foreground">
                next runs:
              </span>
            ) : null}
            {nextRuns.map((run) => (
              <span
                className="rounded-full border border-border px-2 py-0.5 font-mono text-[11px]"
                key={run}
              >
                {run}
              </span>
            ))}
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

function OtherDatabaseObjectsPanel({
  error,
  isLoading,
  objects,
  onRetry,
}: OtherDatabaseObjectsPanelProps) {
  const titleId = useId();
  const [requestedCategory, setRequestedCategory] =
    useState<OtherObjectCategory>(() => firstPopulatedCategory(objects));
  const [query, setQuery] = useState("");
  const [expandedObjectKey, setExpandedObjectKey] = useState<string | null>(
    null
  );
  const [copyNotice, setCopyNotice] = useState("");
  const searchedObjects = objects.filter((object) =>
    objectMatchesSearch(object, query)
  );
  const counts = countByCategory(searchedObjects);
  const selectedCategory =
    counts[requestedCategory] > 0 || searchedObjects.length === 0
      ? requestedCategory
      : firstPopulatedCategory(searchedObjects);

  const categoryMeta = selectedCategoryMeta(selectedCategory);
  const visibleObjects = searchedObjects
    .filter((object) => object.category === selectedCategory)
    .sort((left, right) => left.sortKey.localeCompare(right.sortKey));

  const copySql = (definition: string) => {
    navigator.clipboard
      .writeText(definition)
      .then(() => setCopyNotice("SQL copied."))
      .catch(() => setCopyNotice("Could not copy SQL."));
  };

  let objectListContent: ReactNode;
  if (error) {
    objectListContent = <OtherObjectsError onRetry={onRetry} />;
  } else if (isLoading) {
    objectListContent = <OtherObjectsLoading />;
  } else if (visibleObjects.length > 0) {
    objectListContent = (
      <div className={gridClassName(selectedCategory)}>
        {visibleObjects.map((object) => {
          const key = objectKey(object);
          return (
            <OtherObjectCard
              isExpanded={expandedObjectKey === key}
              key={key}
              object={object}
              onCopySql={copySql}
              onToggle={() =>
                setExpandedObjectKey(expandedObjectKey === key ? null : key)
              }
            />
          );
        })}
      </div>
    );
  } else {
    objectListContent = (
      <div className="rounded-[10px] border border-border border-dashed p-6 text-center text-muted-foreground text-sm">
        None in this database.
      </div>
    );
  }

  return (
    <section
      aria-labelledby={titleId}
      className="overflow-hidden rounded-[14px] border border-border bg-card text-card-foreground shadow-xs"
    >
      <header className="flex flex-wrap items-start gap-2 p-4">
        <h2 className="font-semibold text-sm" id={titleId}>
          Other database objects
        </h2>
        <div className="relative ml-auto w-full sm:w-56">
          <Search className="pointer-events-none absolute top-1/2 left-2.5 size-3.5 -translate-y-1/2 text-muted-foreground" />
          <Input
            aria-label="Search other database objects"
            className="h-8 pl-8 text-sm"
            onChange={(event) => {
              setQuery(event.target.value);
              setExpandedObjectKey(null);
            }}
            placeholder="Search objects…"
            value={query}
          />
        </div>
        <p className="w-full text-muted-foreground text-xs">{INTRO_COPY}</p>
      </header>

      <div className="flex min-h-72 border-border border-t">
        <nav
          aria-label="Other database object categories"
          className="w-48 shrink-0 border-border border-r p-2"
        >
          <div className="flex flex-col gap-px">
            {OTHER_OBJECT_CATEGORIES.map((category) => (
              <Button
                aria-current={
                  selectedCategory === category.key ? "page" : undefined
                }
                className={cn(
                  "h-8 justify-between gap-3 px-2.5 text-muted-foreground text-xs",
                  selectedCategory === category.key &&
                    "bg-muted text-foreground hover:bg-muted"
                )}
                key={category.key}
                onClick={() => {
                  setRequestedCategory(category.key);
                  setExpandedObjectKey(null);
                }}
                type="button"
                variant="ghost"
              >
                <span>{category.label}</span>
                <span className="font-mono text-[11px] tabular-nums">
                  {counts[category.key]}
                </span>
              </Button>
            ))}
          </div>
        </nav>

        <div className="min-w-0 flex-1 p-4">
          <div className="mb-3 flex items-center gap-2 rounded-[9px] border border-border bg-muted/40 px-3 py-2">
            <Info className="size-3.5 shrink-0 text-muted-foreground" />
            <p className="min-w-0 flex-1 text-[12px] text-muted-foreground leading-5">
              {categoryMeta.description}
            </p>
            <Button
              className="h-7 shrink-0 whitespace-nowrap"
              size="xs"
              type="button"
              variant="outline"
            >
              {categoryMeta.actionLabel}
            </Button>
          </div>

          {copyNotice ? (
            <p className="mb-3 text-muted-foreground text-sm" role="status">
              {copyNotice}
            </p>
          ) : null}

          {objectListContent}
        </div>
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

  return (
    <OtherDatabaseObjectsPanel
      error={query.error}
      isLoading={query.isLoading}
      objects={query.data?.objects ?? []}
      onRetry={() => query.refetch()}
    />
  );
}

export type { OtherDatabaseObject, OtherObjectCategory };
export { OtherDatabaseObjectsPanel, OtherDatabaseObjectsSection };
