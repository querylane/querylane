import { z } from "zod";

const setupReturnToSchema = z
  .string()
  .min(1)
  .regex(/^\/(?!\/).*/, "returnTo must be an in-app absolute path")
  .refine((value) => value !== "/setup", {
    message: "returnTo must not point back to setup",
  });

const setupSearchSchema = z.object({
  returnTo: z.optional(setupReturnToSchema),
});

export { setupSearchSchema };
