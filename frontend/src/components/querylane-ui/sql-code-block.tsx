"use client";

import { lazy } from "react";
import { CopyIconButton } from "@/components/ui/copy-icon-button";
import { cn } from "@/lib/utils";
import { OptionalHighlight, PlaintextCode } from "./plaintext-code";

const presentationClasses = {
  definition:
    "bg-muted/30 rounded-none rounded-b-xl border-0 p-4 pr-10 text-(length:--text-xs)",
  compact: "text-xs",
};
const variantClasses = {
  block:
    "bg-muted/40 text-foreground rounded-md border p-3 text-xs leading-relaxed",
  compact:
    "bg-muted/55 text-foreground overflow-x-auto rounded-md border-0 px-3 py-2 text-xs leading-relaxed wrap-break-word whitespace-pre-wrap",
  inline: "truncate text-(length:--text-xs) leading-normal",
};

interface SqlCodeBlockProps {
  className?: string;
  copyable?: boolean;
  copyButtonClassName?: string;
  presentation?: keyof typeof presentationClasses | null;
  sql: string;
  variant?: "block" | "compact" | "inline";
  wrap?: boolean;
}

function UnavailableSql({ sql }: { sql: string }) {
  return <PlaintextCode failed={true} language="sql" source={sql} />;
}

// Resolve a failed enhancement to plaintext once. Rerendering a rejected lazy
// import cannot reload its cached promise; do not offer a misleading retry.
const HighlightedSql = lazy(() =>
  import("@/components/querylane-ui/sql-syntax-highlight-content")
    .then((module) => ({ default: module.SqlSyntaxHighlight }))
    .catch(() => ({ default: UnavailableSql }))
);

/** Keep SQL readable and copyable while the optional enhancement loads. */
function SqlSyntaxHighlight({ sql }: { sql: string }) {
  return (
    <OptionalHighlight language="sql" source={sql}>
      <HighlightedSql sql={sql} />
    </OptionalHighlight>
  );
}

function codeClassName({
  variant = "block",
  wrap = false,
  copyable = true,
  presentation,
  className,
}: SqlCodeBlockProps) {
  return cn(
    "max-w-full min-w-0 font-mono",
    variantClasses[variant],
    variant === "block" &&
      (wrap
        ? "overflow-x-hidden wrap-break-word whitespace-pre-wrap"
        : "overflow-x-auto"),
    copyable &&
      variant !== "inline" &&
      (variant === "block" && wrap ? "pr-14" : "pr-10"),
    presentation && presentationClasses[presentation],
    className
  );
}

function SqlCodeBlock(props: SqlCodeBlockProps) {
  return (
    <div
      className={cn(
        "relative max-w-full min-w-0",
        props.variant === "inline" && "w-full"
      )}
    >
      <pre className={codeClassName(props)}>
        <SqlSyntaxHighlight sql={props.sql} />
      </pre>
      {props.copyable === false ? null : (
        <CopyIconButton
          ariaLabel="Copy SQL"
          className={cn("absolute top-2 right-2", props.copyButtonClassName)}
          value={props.sql}
        />
      )}
    </div>
  );
}

export { SqlCodeBlock, SqlSyntaxHighlight };
