import { createEnv } from "@t3-oss/env-core";
import "@/lib/zod-locale";
import { z } from "zod/mini";

export const env = createEnv({
  client: {
    PUBLIC_API_BASE_URL: z.pipe(
      z.optional(z.union([z.url(), z.literal("")])),
      z.transform((value) => value ?? "")
    ),
    PUBLIC_GITHUB_REPO: z.optional(z.string()),
  },
  clientPrefix: "PUBLIC_",
  runtimeEnv: {
    PUBLIC_API_BASE_URL: import.meta.env["PUBLIC_API_BASE_URL"],
    PUBLIC_GITHUB_REPO: import.meta.env["PUBLIC_GITHUB_REPO"],
  },
});
