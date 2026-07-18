import type { OtherDatabaseObject } from "@/components/console-pages/database-object-categories";
import type { Extension } from "@/protogen/querylane/console/v1alpha1/extension_pb";

const ROUTINE_SIGNATURE_RE = /^([^(]+)(\(.*\))$/;
const QUALIFIED_NAME_RE = /^([^.]+)\.(.+)$/;

// ————————————————————————————————————————————————————————————————
// Row rendering

/** Splits "schema.rest" for the muted-schema-prefix treatment. */
function splitQualifiedName(name: string): { rest: string; schema: string } {
  const match = name.match(QUALIFIED_NAME_RE);
  if (!match) {
    return { rest: name, schema: "" };
  }
  return { rest: match[2] ?? name, schema: match[1] ?? "" };
}

function ObjectName({ name }: { name: string }) {
  const { rest, schema } = splitQualifiedName(name);
  return (
    <>
      {schema ? <span className="text-muted-foreground">{schema}.</span> : null}
      <span className="font-medium text-foreground">{rest}</span>
    </>
  );
}

function ObjectRowShell({
  children,
  tag,
}: {
  children: React.ReactNode;
  tag: React.ReactNode;
}) {
  return (
    <div className="flex items-center justify-between gap-4 border-border/60 border-b py-2 last:border-0">
      <code className="min-w-0 truncate font-mono text-[13px]">{children}</code>
      {tag}
    </div>
  );
}

function UppercaseTag({ children }: { children: React.ReactNode }) {
  return (
    <span className="shrink-0 text-[10px] text-muted-foreground uppercase tracking-wide">
      {children}
    </span>
  );
}

function RoutineRow({ object }: { object: OtherDatabaseObject }) {
  const signature = object.name.match(ROUTINE_SIGNATURE_RE);
  const qualifiedName = signature?.[1] ?? object.name;
  const args = signature?.[2] ?? "";
  const summaryParts = object.summary.split(" · ").filter(Boolean);
  const hasReturnType = object.badge !== "PROCEDURE" && summaryParts.length > 1;
  const returnType = hasReturnType ? summaryParts[0] : null;
  const meta = hasReturnType ? summaryParts.slice(1) : summaryParts;
  return (
    <ObjectRowShell tag={<UppercaseTag>{meta.join(" · ")}</UppercaseTag>}>
      <ObjectName name={qualifiedName} />
      <span className="text-muted-foreground">{args}</span>
      {returnType ? (
        <span className="text-muted-foreground"> → {returnType}</span>
      ) : null}
    </ObjectRowShell>
  );
}

function SequenceRow({ object }: { object: OtherDatabaseObject }) {
  const lastValue = object.summary.split(" · ")[0] ?? "";
  return (
    <ObjectRowShell
      tag={
        <span className="shrink-0 font-mono text-muted-foreground text-xs tabular-nums">
          {lastValue}
        </span>
      }
    >
      <ObjectName name={object.name} />
    </ObjectRowShell>
  );
}

function SummaryRow({ object }: { object: OtherDatabaseObject }) {
  return (
    <ObjectRowShell tag={<UppercaseTag>{object.badge}</UppercaseTag>}>
      <ObjectName name={object.name} />
      {object.summary ? (
        <span className="text-muted-foreground"> — {object.summary}</span>
      ) : null}
    </ObjectRowShell>
  );
}

function CronRow({ object }: { object: OtherDatabaseObject }) {
  const schedule = object.summary.split(" · ")[0] ?? "";
  return (
    <ObjectRowShell
      tag={
        <span className="shrink-0 font-mono text-muted-foreground text-xs tabular-nums">
          {schedule}
        </span>
      }
    >
      <ObjectName name={object.name} />
      {object.detail ? (
        <span className="text-muted-foreground"> — {object.detail}</span>
      ) : null}
    </ObjectRowShell>
  );
}

function ObjectRow({ object }: { object: OtherDatabaseObject }) {
  switch (object.category) {
    case "routines":
      return <RoutineRow object={object} />;
    case "sequences":
      return <SequenceRow object={object} />;
    case "cronJobs":
      return <CronRow object={object} />;
    default:
      return <SummaryRow object={object} />;
  }
}

function ExtensionRow({ extension }: { extension: Extension }) {
  return (
    <div
      className="flex items-baseline justify-between gap-3 border-border/60 border-b py-2 last:border-0"
      title={extension.comment}
    >
      <code className="min-w-0 truncate font-medium font-mono text-[13px] text-foreground">
        {extension.displayName}
      </code>
      <span className="shrink-0 font-mono text-muted-foreground text-xs tabular-nums">
        {extension.installedVersion}
      </span>
    </div>
  );
}

export { ExtensionRow, ObjectRow };
