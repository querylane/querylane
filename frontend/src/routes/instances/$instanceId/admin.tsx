import { createFileRoute } from "@tanstack/react-router";
import { AdminOpsSections } from "@/routes/admin-ops-page";

export const Route = createFileRoute("/instances/$instanceId/admin")({
  component: AdminOpsSections,
});
