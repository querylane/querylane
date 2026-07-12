import { AppInlineError } from "@/components/app-error-view";
import { normalizeAppUiError } from "@/lib/ui-error";

/**
 * Inline error banner for one admin-ops section. Sections keep polling
 * independently, so an error in one (e.g. storage stats) must not blank the
 * others.
 */
export function AdminSectionError({
  area,
  error,
  onRetry,
}: {
  area: string;
  error: unknown;
  onRetry: () => Promise<unknown>;
}) {
  return (
    <AppInlineError
      error={normalizeAppUiError(error, { area, source: "query" })}
      onRetry={onRetry}
    />
  );
}
