import { type ReactNode, Suspense } from "react";
import { canHighlightSource } from "./syntax-highlight-policy";

interface PlaintextCodeProps {
  failed?: boolean;
  language: "bash" | "sql";
  source: string;
}

function PlaintextCode({
  failed = false,
  language,
  source,
}: PlaintextCodeProps) {
  return (
    <>
      <code
        className={language === "sql" ? "language-sql" : "language-bash"}
        data-language={language}
      >
        {source}
      </code>
      {failed ? (
        <span
          className="block font-sans text-xs whitespace-normal text-muted-foreground select-none"
          role="status"
        >
          Syntax highlighting unavailable. Showing plain text.
        </span>
      ) : null}
    </>
  );
}

function OptionalHighlight({
  children,
  language,
  source,
}: {
  children: ReactNode;
  language: "sql" | "bash";
  source: string;
}) {
  const plaintext = <PlaintextCode language={language} source={source} />;
  return canHighlightSource(source) ? (
    <Suspense fallback={plaintext}>{children}</Suspense>
  ) : (
    plaintext
  );
}

export { OptionalHighlight, PlaintextCode };
