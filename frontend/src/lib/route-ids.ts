"use client";

import { useLocation } from "@tanstack/react-router";
import { isNonEmptyString } from "@/lib/value-guards";

interface RouteIds {
  databaseId?: string;
  instanceId?: string;
}

function decodePathSegment(segment: string) {
  try {
    return decodeURIComponent(segment);
  } catch {
    return segment;
  }
}

function parseRouteIdsFromPathname(pathname: string) {
  const segments = pathname.split("/").filter(Boolean);
  if (segments[0] !== "instances") {
    return {} satisfies RouteIds;
  }

  const [, instanceId] = segments;
  if (!isNonEmptyString(instanceId)) {
    return {} satisfies RouteIds;
  }

  const routeIds: RouteIds = {
    instanceId: decodePathSegment(instanceId),
  };

  if (segments[2] !== "databases") {
    return routeIds;
  }

  const { 3: databaseId } = segments;
  if (!isNonEmptyString(databaseId)) {
    return routeIds;
  }
  routeIds.databaseId = decodePathSegment(databaseId);

  return routeIds;
}

function useCurrentRouteIds() {
  const pathname = useLocation({
    select: (location) => location.pathname,
  });

  return parseRouteIdsFromPathname(pathname);
}

export { parseRouteIdsFromPathname, useCurrentRouteIds };
