import { parseResourceLeafId } from "@/lib/console-resources";

function resourceDisplayName(resource: { displayName?: string; name: string }) {
  return resource.displayName || parseResourceLeafId(resource.name);
}

function matchesNameFilter(name: string, query: string) {
  const trimmed = query.trim();
  return !trimmed || name.toLowerCase().includes(trimmed.toLowerCase());
}

function buildNameContainsFilter(query: string): string | undefined {
  const trimmed = query.trim();
  if (!trimmed) {
    return;
  }
  const escaped = escapeAipFilterString(trimmed);
  return `name:"${escaped}"`;
}

function escapeAipFilterString(value: string): string {
  return value.replaceAll("\\", "\\\\").replaceAll('"', '\\"');
}

export {
  buildNameContainsFilter,
  escapeAipFilterString,
  matchesNameFilter,
  resourceDisplayName,
};
