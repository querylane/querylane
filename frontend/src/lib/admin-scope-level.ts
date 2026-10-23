import { isNonEmptyString } from "@/lib/value-guards";
/**
 * Resolves the admin shell scope from most specific to least specific.
 * Database routes outrank instance routes; missing route IDs mean no active scope.
 */
export function resolveScopeLevel(routeIds: {
  databaseId?: string;
  instanceId?: string;
}) {
  if (isNonEmptyString(routeIds.databaseId)) {
    return "database" as const;
  }
  if (isNonEmptyString(routeIds.instanceId)) {
    return "instance" as const;
  }
  return "none" as const;
}
