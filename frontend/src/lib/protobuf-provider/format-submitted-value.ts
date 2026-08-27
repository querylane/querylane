export function formatSubmittedValue(value: Record<string, unknown>): string {
  return JSON.stringify(
    value,
    (_key, nestedValue: unknown) => {
      if (typeof nestedValue === "bigint") {
        return nestedValue.toString();
      }
      if (nestedValue instanceof Uint8Array) {
        return Array.from(nestedValue);
      }
      return nestedValue;
    },
    2
  );
}
