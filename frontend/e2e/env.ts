import { env as processEnv } from "node:process";
import { createEnv } from "@t3-oss/env-core";
import { z } from "zod";

const MAX_PORT = 65_535;

const optionalPort = z.preprocess((value) => {
  if (value === undefined || value === "") {
    return;
  }
  return Number(value);
}, z.number().int().min(1).max(MAX_PORT).optional());
const booleanFlag = z.preprocess(
  (value) => value === "true" || value === "1",
  z.boolean()
);

export const e2eEnv = createEnv({
  runtimeEnv: processEnv,
  server: {
    BASE_URL: z.string().url().optional(),
    CI: booleanFlag,
    PLAYWRIGHT_BASE_URL: z.string().url().optional(),
    PLAYWRIGHT_PORT: optionalPort,
    PORT: optionalPort,
    QUERYLANE_API_URL: z.string().url().optional(),
    QUERYLANE_E2E_SKIP_BUILD: booleanFlag,
  },
});
