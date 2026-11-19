import { resolveImplicitAdminPageFromPathname } from "@/lib/admin-page";
import { parseRouteIdsFromPathname } from "@/lib/route-ids";
import { isNonEmptyString } from "@/lib/value-guards";

function decodeSegment(segment: string) {
  try {
    return decodeURIComponent(segment);
  } catch {
    return segment;
  }
}

export type BreadcrumbTail =
  | { kind: "none" }
  | { kind: "page"; label: string }
  | { kind: "role"; instanceId: string; roleId: string };

export function resolveBreadcrumbTail(pathname: string) {
  const { instanceId } = parseRouteIdsFromPathname(pathname);
  if (!isNonEmptyString(instanceId)) {
    return { kind: "none" } satisfies BreadcrumbTail;
  }

  const segments = pathname.split("/").filter(Boolean);
  if (segments[2] === "admin" && !isNonEmptyString(segments[3])) {
    return { kind: "page", label: "Admin" } satisfies BreadcrumbTail;
  }

  const page = resolveImplicitAdminPageFromPathname(pathname);
  switch (page) {
    case "instance.overview":
    case "database.overview":
      return { kind: "page", label: "Overview" } satisfies BreadcrumbTail;
    case "instance.configuration":
      return { kind: "page", label: "Configuration" } satisfies BreadcrumbTail;
    case "database.extensions":
      return { kind: "page", label: "Extensions" } satisfies BreadcrumbTail;
    case "database.explorer":
      return { kind: "page", label: "Data Explorer" } satisfies BreadcrumbTail;
    case "database.sql":
      return { kind: "page", label: "SQL" } satisfies BreadcrumbTail;
    case "database.workbench":
      return { kind: "page", label: "SQL workbench" } satisfies BreadcrumbTail;
    case "instance.roles": {
      const roleSegments = pathname.split("/").filter(Boolean);
      const roleSegment =
        roleSegments[2] === "roles" ? roleSegments[3] : undefined;
      if (isNonEmptyString(roleSegment)) {
        return {
          instanceId,
          kind: "role",
          roleId: decodeSegment(roleSegment),
        } satisfies BreadcrumbTail;
      }
      return { kind: "page", label: "Roles" } satisfies BreadcrumbTail;
    }
    case undefined:
    case "instance.activity":
    default:
      return { kind: "none" } satisfies BreadcrumbTail;
  }
}
