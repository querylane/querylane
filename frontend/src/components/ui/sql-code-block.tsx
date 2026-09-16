"use client";

import { lazy, Suspense } from "react";
import { CopyIconButton } from "@/components/ui/copy-icon-button";
import { cn } from "@/lib/utils";

type SqlCodeBlockProps = {
  className?: string;
  copyButtonClassName?: string;
  copyable?: boolean;
  sql: string;
  variant?: "block" | "compact" | "inline";
  wrap?: boolean;
};

const HighlightedSql = lazy(() =>
  import("@/components/ui/sql-syntax-highlight-content").then((module) => ({
    default: module.SqlSyntaxHighlight,
  }))
);

/** Keep SQL readable and copyable while the syntax highlighter loads. */
export function SqlSyntaxHighlight({ sql }: { sql: string }) {
  return (
    <Suspense fallback={<code className="language-sql" data-language="sql">{sql}</code>}>
      <HighlightedSql sql={sql} />
    </Suspense>
  );
}

export function SqlCodeBlock({
  className,
  copyButtonClassName,
  copyable = true,
  sql: sqlText,
  variant = "block",
  wrap = false,
}: SqlCodeBlockProps) {
  const compact = variant === "compact";
  const inline = variant === "inline";

  return (
    <div className={cn("relative min-w-0 max-w-full", inline && "w-full")}>
      <pre
        className={cn(
          inline
            ? "min-w-0 max-w-full truncate font-mono text-[12px] leading-normal"
            : cn(
                "min-w-0 max-w-full rounded-md font-mono text-foreground text-xs leading-relaxed",
                compact
                  ? "overflow-x-auto whitespace-pre-wrap break-words border-0 bg-muted/55 px-3 py-2"
                  : "border bg-muted/40 p-3"
              ),
          !inline &&
            !compact &&
            (wrap
              ? cn(
                  "overflow-x-hidden whitespace-pre-wrap break-words",
                  copyable && "pr-14"
                )
              : cn("overflow-x-auto", copyable && "pr-10")),
          compact && copyable && "pr-10",
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
