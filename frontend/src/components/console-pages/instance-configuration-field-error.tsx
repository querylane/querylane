"use client";

import { isNonEmptyString } from "@/lib/value-guards";

export function FieldError({ error }: { error: string | undefined }) {
  return isNonEmptyString(error) ? (
    <p className="text-destructive text-xs" role="alert">
      {error}
    </p>
  ) : null;
}
