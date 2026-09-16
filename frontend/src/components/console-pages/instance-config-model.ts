import type { useGetInstanceQuery } from "@/hooks/api/instance";

type InstanceQueryData = ReturnType<typeof useGetInstanceQuery>["data"];
type InstanceRecord = NonNullable<NonNullable<InstanceQueryData>["instance"]>;
const DEFAULT_POSTGRES_PORT = 5432;

interface InstanceLabelEntry {
  id: string;
  key: string;
  value: string;
}

function createLabelEntry(key = "", value = ""): InstanceLabelEntry {
  return {
    id: crypto.randomUUID(),
    key,
    value,
  };
}

function labelsToEntries(labels: Record<string, string>): InstanceLabelEntry[] {
  return Object.entries(labels).map(([key, value]) =>
    createLabelEntry(key, value)
  );
}

function sortLabels(labels: InstanceLabelEntry[]) {
  return labels
    .map(({ key, value }) => ({ key, value }))
    .sort(
      (left, right) =>
        left.key.localeCompare(right.key) ||
        left.value.localeCompare(right.value)
    );
}

function labelsEqual(a: InstanceLabelEntry[], b: InstanceLabelEntry[]) {
  if (a.length !== b.length) {
    return false;
  }

  const sortedA = sortLabels(a);
  const sortedB = sortLabels(b);
  for (const [index, label] of sortedA.entries()) {
    const other = sortedB[index];
    if (label.key !== other?.key || label.value !== other.value) {
      return false;
    }
  }
  return true;
}

function labelsToMap(labels: InstanceLabelEntry[]): Record<string, string> {
  return Object.fromEntries(
    labels.map((label) => [label.key.trim(), label.value])
  );
}

export type { InstanceLabelEntry, InstanceRecord };
export {
  createLabelEntry,
  DEFAULT_POSTGRES_PORT,
  labelsEqual,
  labelsToEntries,
  labelsToMap,
};
