import { resolveImplicitAdminPageFromPathname } from "@/lib/admin-page";
import { parseRouteIdsFromPathname } from "@/lib/route-ids";

/**
 * Page-location tail appended to the connection selectors in the header
 * breadcrumb. Derived purely from the pathname so it stays in lockstep with the
 * pathname -> page mapping used to render the page (resolveImplicitAdminPageFromPathname).
 *
 * - "none": no recognized page (or no instance selected) — render nothing.
 * - "page": a single current-page segment (Overview / Configuration / Roles / Explorer).
 * - "role": role detail — a "Roles" link back to the list plus the current role
 *   (name + kind badge), resolved from the roles query by the rendering component.
 */
function decodeSegment(segment: string): string {
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

export function resolveBreadcrumbTail(pathname: string): BreadcrumbTail {
  const { instanceId } = parseRouteIdsFromPathname(pathname);
  if (!instanceId) {
    return { kind: "none" };
  }

  const page = resolveImplicitAdminPageFromPathname(pathname);
  switch (page) {
    case "instance.overview":
    case "database.overview":
      return { kind: "page", label: "Overview" };
    case "instance.configuration":
      return { kind: "page", label: "Configuration" };
    case "database.extensions":
      return { kind: "page", label: "Extensions" };
    case "database.explorer":
      return { kind: "page", label: "Data Explorer" };
    case "instance.roles": {
      const segments = pathname.split("/").filter(Boolean);
      const roleSegment = segments[2] === "roles" ? segments[3] : undefined;
      if (roleSegment) {
        return {
          instanceId,
          kind: "role",
          roleId: decodeSegment(roleSegment),
        };
      }
      return { kind: "page", label: "Roles" };
    }
    default:
      return { kind: "none" };
  }
}
