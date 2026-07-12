import { createFileRoute } from "@tanstack/react-router";
import { AdminOpsRoutePage } from "@/routes/admin-ops-page";

export const Route = createFileRoute("/admin")({
  component: AdminOpsRoutePage,
});
