"use client";

import { lazy, Suspense } from "react";

const HighlightedBash = lazy(() =>
  import("./bash-syntax-highlight-content").then((module) => ({
    default: module.BashSyntaxHighlight,
  }))
);

export function BashSyntaxHighlight({ code }: { code: string }) {
  return (
    <Suspense
      fallback={
        <code className="language-bash" data-language="bash">
          {code}
        </code>
      }
    >
      <HighlightedBash code={code} />
    </Suspense>
  );
}
