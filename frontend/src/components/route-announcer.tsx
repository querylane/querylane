"use client";

import { useLocation } from "@tanstack/react-router";

function instancePageName(segments: string[]): string {
  const [, , sub] = segments;
  if (!sub) {
    return "Instance overview";
  }
  if (sub === "configuration") {
    return "Instance configuration";
  }
  if (sub === "roles") {
    return segments[3] ? "Role detail" : "Roles";
  }
  if (sub === "databases") {
    if (!segments[3]) {
      return "Instance overview";
    }
    if (segments[4] === "explorer") {
      return "Data explorer";
    }
    if (segments[4] === "extensions") {
      return "Extensions";
    }
    return "Database overview";
  }
  return "Querylane";
}

/**
 * Maps a URL pathname to a human-readable, sentence-case page name for
 * screen-reader announcements. Returns a generic "Querylane" label for
 * deep dynamic routes (e.g. instance/database pages) where the meaningful
 * name lives in page headings already read by the reader.
 */
function pathnameToPageName(pathname: string): string {
  if (pathname === "/" || pathname === "") {
    return "Home";
  }

  const segments = pathname.split("/").filter(Boolean);
  switch (segments[0]) {
    case "setup":
      return "Setup";
    case "new-instance":
      return "New instance";
    case "access-denied":
      return "Access denied";
    case "instances":
      return instancePageName(segments);
    default:
      return "Querylane";
  }
}

export function RouteAnnouncer() {
  const pathname = useLocation({ select: (location) => location.pathname });
  const announcement = pathnameToPageName(pathname);

  return (
    <output aria-atomic="true" aria-live="polite" className="sr-only">
      {announcement}
    </output>
  );
}
