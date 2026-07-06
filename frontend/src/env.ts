import { createEnv } from "@t3-oss/env-core";
import { z } from "zod/v4";

export const env = createEnv({
  client: {
    PUBLIC_API_BASE_URL: z
      .union([z.url(), z.literal("")])
      .optional()
      .transform((value) => value ?? ""),
    PUBLIC_GITHUB_REPO: z.string().optional(),
  },
  clientPrefix: "PUBLIC_",
  runtimeEnv: {
    PUBLIC_API_BASE_URL: import.meta.env.PUBLIC_API_BASE_URL,
    PUBLIC_GITHUB_REPO: import.meta.env.PUBLIC_GITHUB_REPO,
  },
});
