import { createFileRoute } from "@tanstack/react-router";
import { AdminOpsSections } from "@/routes/admin-ops-page";

// Instance-scoped variant of the app-global /admin page. The content is
// identical (backend-wide operational state); nesting under the instance
// layout keeps the current instance/database selection and sidebar intact
// while browsing the admin panel.
export const Route = createFileRoute("/instances/$instanceId/admin")({
  component: AdminOpsSections,
});
