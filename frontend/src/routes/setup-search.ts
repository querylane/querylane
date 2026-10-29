import "@/lib/zod-locale";
import { catch as catchInvalid, z } from "zod/mini";

const setupReturnToSchema = z.string().check(
  z.minLength(1),
  z.regex(/^\/(?!\/).*/u, "returnTo must be an in-app absolute path"),
  z.refine((value) => value !== "/setup", {
    message: "returnTo must not point back to setup",
  })
);

const setupMethodSchema = catchInvalid(
  z.optional(z.enum(["embedded", "manual_yaml", "ui_configured"])),
  undefined
);

const setupSearchSchema = z.object({
  method: setupMethodSchema,
  returnTo: z.optional(setupReturnToSchema),
});

export { setupSearchSchema };
