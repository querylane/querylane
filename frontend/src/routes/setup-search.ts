import { z } from "zod";

const setupReturnToSchema = z
  .string()
  .min(1)
  .regex(/^\/(?!\/).*/, "returnTo must be an in-app absolute path")
  .refine((value) => value !== "/setup", {
    message: "returnTo must not point back to setup",
  });

const setupMethodSchema = z
  .optional(z.enum(["embedded", "manual_yaml", "ui_configured"]))
  .catch(undefined);

const setupSearchSchema = z.object({
  method: setupMethodSchema,
  returnTo: z.optional(setupReturnToSchema),
});

export { setupSearchSchema };
