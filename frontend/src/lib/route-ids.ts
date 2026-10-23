"use client";

import { useLocation } from "@tanstack/react-router";
import { isNonEmptyString } from "@/lib/value-guards";

interface RouteIds {
  databaseId?: string;
  instanceId?: string;
}

function decodePathSegment(segment: string): string {
  try {
    return decodeURIComponent(segment);
  } catch {
    return segment;
  }
}

function parseRouteIdsFromPathname(pathname: string): RouteIds {
  const segments = pathname.split("/").filter(Boolean);
  if (segments[0] !== "instances") {
    return {};
  }

  const [, instanceId] = segments;
  if (!isNonEmptyString(instanceId)) {
    return {};
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

function useCurrentRouteIds(): RouteIds {
  const pathname = useLocation({
    select: (location) => location.pathname,
  });

  return parseRouteIdsFromPathname(pathname);
}

export { parseRouteIdsFromPathname, useCurrentRouteIds };
