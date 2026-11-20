import { env as processEnv } from "node:process";
import { createEnv } from "@t3-oss/env-core";
import { z } from "zod";

const MAX_PORT = 65_535;

const optionalPort = z.preprocess((value): number | undefined => {
  if (value === undefined || value === "") {
    return undefined;
  }
  return Number(value);
}, z.number().int().min(1).max(MAX_PORT).optional());
const booleanFlag = z.preprocess(
  (value) => value === "true" || value === "1",
  z.boolean()
);

export const e2eEnv = createEnv({
  // Playwright config always runs in Node, even when a DOM-environment unit
  // test imports it to check config invariants.
  isServer: true,
  runtimeEnv: processEnv,
  server: {
    BASE_URL: z.url().optional(),
    CI: booleanFlag,
    DOCS_BASE_URL: z.url().optional(),
    PLAYWRIGHT_BASE_URL: z.url().optional(),
    PLAYWRIGHT_PORT: optionalPort,
    PORT: optionalPort,
    QUERYLANE_API_URL: z.url().optional(),
    QUERYLANE_E2E_SKIP_BUILD: booleanFlag,
    QUERYLANE_REACT_PROFILE: z.enum(["0", "1"]).optional(),
    QUERYLANE_REACT_PROFILE_CONFIG_DIGEST: z.string().optional(),
    QUERYLANE_REACT_PROFILE_REVISION: z.string().optional(),
    QUERYLANE_REACT_PROFILE_SOURCE_DIGEST: z.string().optional(),
  },
});
