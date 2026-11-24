"use client";

import { lazy } from "react";
import { OptionalHighlight, PlaintextCode } from "./plaintext-code";

function UnavailableBash({ code }: { code: string }) {
  return <PlaintextCode failed={true} language="bash" source={code} />;
}

const HighlightedBash = lazy(() =>
  import("./bash-syntax-highlight-content")
    .then((module) => ({ default: module.BashSyntaxHighlight }))
    .catch(() => ({ default: UnavailableBash }))
);

export function BashSyntaxHighlight({ code }: { code: string }) {
  return (
    <OptionalHighlight language="bash" source={code}>
      <HighlightedBash code={code} />
    </OptionalHighlight>
  );
}
