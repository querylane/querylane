import { createFileRoute } from "@tanstack/react-router";
import { SetupRoutePage } from "@/routes/setup-page";
import { setupSearchSchema } from "@/routes/setup-search";

export const Route = createFileRoute("/setup")({
  component: SetupRoutePage,
  validateSearch: setupSearchSchema,
});
