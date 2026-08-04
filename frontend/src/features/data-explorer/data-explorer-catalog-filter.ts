import { buildContainsFilter } from "@/lib/aip-filter";
import { parseResourceLeafId } from "@/lib/console-resources";

function resourceDisplayName(resource: { displayName?: string; name: string }) {
  return resource.displayName || parseResourceLeafId(resource.name);
}

function matchesNameFilter(name: string, query: string) {
  const trimmed = query.trim();
  return !trimmed || name.toLowerCase().includes(trimmed.toLowerCase());
}

function buildNameContainsFilter(query: string): string | undefined {
  return buildContainsFilter("name", query);
}

export { buildNameContainsFilter, matchesNameFilter, resourceDisplayName };
