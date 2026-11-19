import { get } from "react-hook-form";
import { mapEntryCriteriaPrefix } from "@/lib/protobuf-provider/map-error-target";

/** Read all messages, including resolver/server criteria, without walking DOM refs. */
const formErrorMessages: (error: unknown) => string[] = (error) => {
  if (error === null || typeof error !== "object") {
    return [];
  }
  if ("message" in error && typeof error.message === "string") {
    let messages: string[] = [];
    if (
      "types" in error &&
      error.types !== null &&
      typeof error.types === "object"
    ) {
      messages = Object.values(error.types).flatMap((value) =>
        errorCriteriaMessages(value)
      );
    }
    return [...new Set([error.message, ...messages])];
  }
  return [
    ...new Set(
      Object.values(error).flatMap((child) => formErrorMessages(child))
    ),
  ];
};

function labelRowErrors(
  error: unknown,
  labels: readonly {
    id: string;
    key: string;
  }[],
  blankKeyError?: string
) {
  return Object.fromEntries(
    labels.flatMap((label) => {
      const key = label.key.trim();
      let messages = labelEntryMessages(error, key);
      if (
        !key &&
        typeof blankKeyError === "string" &&
        blankKeyError.length > 0
      ) {
        messages = [blankKeyError];
      }
      return messages.length > 0 ? [[label.id, messages]] : [];
    })
  );
}

function labelEntryMessages(error: unknown, key: string) {
  if (
    error !== null &&
    typeof error === "object" &&
    "types" in error &&
    error.types !== null &&
    typeof error.types === "object"
  ) {
    const prefix = mapEntryCriteriaPrefix([key]);
    return Object.entries(error.types).flatMap(([criterion, value]) =>
      criterion.startsWith(prefix) ? errorCriteriaMessages(value) : []
    );
  }
  return formErrorMessages(get(error, key));
}

function unassignedLabelMessages(
  error: string | undefined,
  rows: Record<string, string[]>
) {
  const displayed = new Set(Object.values(rows).flat());
  return error?.split("\n").filter((message) => !displayed.has(message)) ?? [];
}

function errorCriteriaMessages(value: unknown) {
  if (typeof value === "string") {
    return [value] satisfies string[];
  }
  if (Array.isArray(value)) {
    return value.filter(
      (item: unknown): item is string => typeof item === "string"
    );
  }
  return [] satisfies string[];
}

export { formErrorMessages, labelRowErrors, unassignedLabelMessages };
