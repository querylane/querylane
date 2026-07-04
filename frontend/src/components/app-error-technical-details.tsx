"use client";

import { buildAppUiErrorTechnicalSections } from "@/lib/ui-error-sections";
import type { AppUiError } from "@/lib/ui-error-types";

interface AppErrorTechnicalDetailsProps {
  error: AppUiError;
}

function TechnicalDetailsCodeBlock({
  content,
  language,
}: {
  content: string;
  language: string;
}) {
  return (
    <pre
      className="max-h-96 overflow-auto rounded-md border bg-muted/40 p-3 text-muted-foreground text-xs"
      data-language={language}
    >
      <code>{content}</code>
    </pre>
  );
}

export function AppErrorTechnicalDetails({
  error,
}: AppErrorTechnicalDetailsProps) {
  const sections = buildAppUiErrorTechnicalSections(error);

  return (
    <div className="app-error-technical-details space-y-4">
      {sections.map((section) => (
        <section className="space-y-2" key={section.id}>
          <p className="font-medium text-foreground/90 text-sm">
            {section.title}
          </p>
          <TechnicalDetailsCodeBlock
            content={section.content}
            language={section.language}
          />
        </section>
      ))}
    </div>
  );
}
