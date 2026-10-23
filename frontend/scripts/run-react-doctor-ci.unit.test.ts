import { spawnSync } from "node:child_process";
import {
  chmodSync,
  mkdirSync,
  mkdtempSync,
  rmSync,
  writeFileSync,
} from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { expect, test } from "@rstest/core";

const bun = spawnSync("which", ["bun"], { encoding: "utf-8" }).stdout.trim();

test.each([{ output: "not JSON" }, { output: "{}" }])(
  "rejects a successful Doctor subprocess without a valid report: $output",
  ({ output }) => {
    const root = mkdtempSync(join(tmpdir(), "querylane-doctor-"));
    try {
      const bin = join(root, "bin");
      mkdirSync(bin);
      const stub = join(bin, "bun");
      writeFileSync(stub, `#!/bin/sh\nprintf '%s' '${output}'\n`);
      chmodSync(stub, 0o755);
      const result = spawnSync(
        bun,
        [join(import.meta.dirname, "run-react-doctor-ci.ts")],
        {
          cwd: root,
          encoding: "utf-8",
          env: { PATH: bin },
        }
      );
      expect(result.status).toBe(1);
      expect(result.stderr).toContain(
        "Could not parse React Doctor JSON output"
      );
    } finally {
      rmSync(root, { recursive: true });
    }
  }
);
