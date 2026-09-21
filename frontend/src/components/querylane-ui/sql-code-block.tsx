"use client";

import { cva, type VariantProps } from "class-variance-authority";
import { lazy, Suspense } from "react";
import { CopyIconButton } from "@/components/ui/copy-icon-button";
import { cn } from "@/lib/utils";

const sqlCodeBlockPresentations = cva("", {
  variants: {
    presentation: {
      definition:
        "text-(length:--text-xs) rounded-none rounded-b-xl border-0 bg-muted/30 p-4 pr-10",
      compact: "text-xs",
    },
  },
});

const sqlCodeBlockVariants = cva("min-w-0 max-w-full font-mono", {
  variants: {
    variant: {
      block:
        "rounded-md border bg-muted/40 p-3 text-foreground text-xs leading-relaxed",
      compact:
        "overflow-x-auto whitespace-pre-wrap break-words rounded-md border-0 bg-muted/55 px-3 py-2 text-foreground text-xs leading-relaxed",
      inline: "text-(length:--text-xs) truncate leading-normal",
    },
    copyable: { true: "", false: "" },
    wrap: { true: "", false: "" },
  },
  compoundVariants: [
    {
      variant: "block",
      wrap: true,
      className: "overflow-x-hidden whitespace-pre-wrap break-words",
    },
    { variant: "block", wrap: false, className: "overflow-x-auto" },
    { variant: "block", wrap: true, copyable: true, className: "pr-14" },
    { variant: "block", wrap: false, copyable: true, className: "pr-10" },
    { variant: "compact", copyable: true, className: "pr-10" },
  ],
});

type SqlCodeBlockProps = {
  className?: string;
  copyButtonClassName?: string;
  copyable?: boolean;
  sql: string;
  variant?: "block" | "compact" | "inline";
  wrap?: boolean;
} & VariantProps<typeof sqlCodeBlockPresentations>;

const HighlightedSql = lazy(() =>
  import("@/components/querylane-ui/sql-syntax-highlight-content").then(
    (module) => ({
      default: module.SqlSyntaxHighlight,
    })
  )
);

/** Keep SQL readable and copyable while the syntax highlighter loads. */
export function SqlSyntaxHighlight({ sql }: { sql: string }) {
  return (
    <Suspense
      fallback={
        <code className="language-sql" data-language="sql">
          {sql}
        </code>
      }
    >
      <HighlightedSql sql={sql} />
    </Suspense>
  );
}

export function SqlCodeBlock({
  className,
  presentation,
  copyButtonClassName,
  copyable = true,
  sql: sqlText,
  variant = "block",
  wrap = false,
}: SqlCodeBlockProps) {
  const inline = variant === "inline";

  return (
    <div className={cn("relative min-w-0 max-w-full", inline && "w-full")}>
      <pre
        className={cn(
          sqlCodeBlockVariants({ variant, wrap, copyable }),
          sqlCodeBlockPresentations({ presentation }),
          className
        )}
      >
        <SqlSyntaxHighlight sql={sqlText} />
      </pre>
      {copyable ? (
        <CopyIconButton
          ariaLabel="Copy SQL"
          className={cn("absolute top-2 right-2", copyButtonClassName)}
          value={sqlText}
        />
      ) : null}
    </div>
  );
}
