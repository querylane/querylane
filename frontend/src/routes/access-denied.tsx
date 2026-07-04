import { createFileRoute } from "@tanstack/react-router";
import { z } from "zod";
import { AccessDeniedRoutePage } from "@/routes/access-denied-page";

const accessDeniedSearchSchema = z.object({
  returnTo: z.optional(
    z
      .string()
      .min(1)
      .regex(/^\/(?!\/).*/, "returnTo must be an in-app absolute path")
  ),
});

export const Route = createFileRoute("/access-denied")({
  component: AccessDeniedRoutePage,
  validateSearch: accessDeniedSearchSchema,
});
