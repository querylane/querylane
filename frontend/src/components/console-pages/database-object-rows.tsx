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
      <span className="text-foreground font-medium">{rest}</span>
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
    <div className="border-border/60 flex items-center justify-between gap-4 border-b py-2 last:border-0">
      <code className="min-w-0 truncate font-mono text-(length:--text-caption)">
        {children}
      </code>
      {tag}
    </div>
  );
}

function UppercaseTag({ children }: { children: React.ReactNode }) {
  return (
    <span className="text-muted-foreground shrink-0 tracking-wide text-(length:--text-micro) uppercase">
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
        <span className="text-muted-foreground shrink-0 font-mono text-xs tabular-nums">
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
        <span className="text-muted-foreground shrink-0 font-mono text-xs tabular-nums">
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
      className="border-border/60 flex items-baseline justify-between gap-3 border-b py-2 last:border-0"
      title={extension.comment}
    >
      <code className="text-foreground min-w-0 truncate font-mono font-medium text-(length:--text-caption)">
        {extension.displayName}
      </code>
      <span className="text-muted-foreground shrink-0 font-mono text-xs tabular-nums">
        {extension.installedVersion}
      </span>
    </div>
  );
}

export { ExtensionRow, ObjectRow };
