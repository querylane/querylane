"use client";

import { cva, type VariantProps } from "class-variance-authority";
import { lazy, Suspense } from "react";
import { CopyIconButton } from "@/components/ui/copy-icon-button";
import { cn } from "@/lib/utils";

const sqlCodeBlockPresentations = cva("", {
  variants: {
    presentation: {
      definition:
        "rounded-none rounded-b-xl border-0 bg-muted/30 p-4 pr-10 text-(length:--text-xs)",
      compact: "text-xs",
    },
  },
});

const sqlCodeBlockVariants = cva("max-w-full min-w-0 font-mono", {
  variants: {
    variant: {
      block:
        "rounded-md border bg-muted/40 p-3 text-xs leading-relaxed text-foreground",
      compact:
        "overflow-x-auto rounded-md border-0 bg-muted/55 px-3 py-2 text-xs leading-relaxed wrap-break-word whitespace-pre-wrap text-foreground",
      // Keep line height after font size: cn() resolves conflicts in order.
      inline: ["truncate text-(length:--text-xs)", "leading-normal"],
    },
    copyable: { true: "", false: "" },
    wrap: { true: "", false: "" },
  },
  compoundVariants: [
    {
      variant: "block",
      wrap: true,
      className: "overflow-x-hidden wrap-break-word whitespace-pre-wrap",
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

function observeSqlScrollFocus(node: HTMLPreElement | null) {
  if (!node) {
    return undefined;
  }
  const element = node;

  function syncScrollFocus() {
    const { overflowX } = getComputedStyle(element);
    element.tabIndex =
      (overflowX === "auto" || overflowX === "scroll") &&
      element.scrollWidth > element.clientWidth
        ? 0
        : -1;
  }

  // Lazy highlighting, font delivery and container resizing can each change
  // overflow. Only a genuinely scrollable snippet belongs in the tab order.
  syncScrollFocus();
  const resizeObserver =
    typeof ResizeObserver === "undefined"
      ? undefined
      : new ResizeObserver(syncScrollFocus);
  resizeObserver?.observe(element);
  const mutationObserver = new MutationObserver(syncScrollFocus);
  mutationObserver.observe(element, {
    attributeFilter: ["class"],
    childList: true,
    characterData: true,
    subtree: true,
  });
  document.fonts?.addEventListener("loadingdone", syncScrollFocus);
  return () => {
    resizeObserver?.disconnect();
    mutationObserver.disconnect();
    document.fonts?.removeEventListener("loadingdone", syncScrollFocus);
  };
}

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
    <div className={cn("relative max-w-full min-w-0", inline && "w-full")}>
      <pre
        className={cn(
          "focus-visible:outline-2 focus-visible:-outline-offset-2 focus-visible:outline-primary",
          sqlCodeBlockVariants({ variant, wrap, copyable }),
          sqlCodeBlockPresentations({ presentation }),
          className
        )}
        ref={observeSqlScrollFocus}
        tabIndex={-1}
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
