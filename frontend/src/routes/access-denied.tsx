import { createFileRoute } from "@tanstack/react-router";
import "@/lib/zod-locale";
import { z } from "zod/mini";
import { AccessDeniedRoutePage } from "@/routes/access-denied-page";

const accessDeniedSearchSchema = z.object({
  returnTo: z.optional(
    z
      .string()
      .check(
        z.minLength(1),
        z.regex(/^\/(?!\/).*/u, "returnTo must be an in-app absolute path")
      )
  ),
});

export const Route = createFileRoute("/access-denied")({
  component: AccessDeniedRoutePage,
  validateSearch: accessDeniedSearchSchema,
});
