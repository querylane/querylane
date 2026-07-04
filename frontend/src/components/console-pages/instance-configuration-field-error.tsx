"use client";

export function FieldError({ error }: { error: string | undefined }) {
  return error ? (
    <p className="text-destructive text-xs" role="alert">
      {error}
    </p>
  ) : null;
}
