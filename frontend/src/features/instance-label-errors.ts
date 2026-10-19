import { get } from "react-hook-form";
import { mapEntryCriteriaPrefix } from "@/lib/protobuf-provider/map-error-target";

/** Read all messages, including resolver/server criteria, without walking DOM refs. */
function formErrorMessages(error: unknown): string[] {
  if (!error || typeof error !== "object") {
    return [];
  }
  if ("message" in error && typeof error.message === "string") {
    let messages: string[] = [];
    if ("types" in error && error.types && typeof error.types === "object") {
      messages = Object.values(error.types).flatMap(errorCriteriaMessages);
    }
    return [...new Set([error.message, ...messages])];
  }
  return [
    ...new Set(
      Object.values(error).flatMap((child) => formErrorMessages(child))
    ),
  ];
}

function labelRowErrors(
  error: unknown,
  labels: readonly { id: string; key: string }[],
  blankKeyError?: string
): Record<string, string[]> {
  return Object.fromEntries(
    labels.flatMap((label) => {
      const key = label.key.trim();
      let messages = labelEntryMessages(error, key);
      if (!key && blankKeyError) {
        messages = [blankKeyError];
      }
      return messages.length > 0 ? [[label.id, messages]] : [];
    })
  );
}

function labelEntryMessages(error: unknown, key: string): string[] {
  if (
    error &&
    typeof error === "object" &&
    "types" in error &&
    error.types &&
    typeof error.types === "object"
  ) {
    const prefix = mapEntryCriteriaPrefix([key]);
    return Object.entries(error.types)
      .filter(([criterion]) => criterion.startsWith(prefix))
      .flatMap(([, value]) => errorCriteriaMessages(value));
  }
  return formErrorMessages(get(error, key));
}

function unassignedLabelMessages(
  error: string | undefined,
  rows: Record<string, string[]>
): string[] {
  const displayed = new Set(Object.values(rows).flat());
  return error?.split("\n").filter((message) => !displayed.has(message)) ?? [];
}

function errorCriteriaMessages(value: unknown): string[] {
  if (typeof value === "string") {
    return [value];
  }
  if (Array.isArray(value)) {
    return value.filter(
      (item: unknown): item is string => typeof item === "string"
    );
  }
  return [];
}

export { formErrorMessages, labelRowErrors, unassignedLabelMessages };
