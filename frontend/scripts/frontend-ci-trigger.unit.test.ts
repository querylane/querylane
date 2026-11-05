import { spawnSync } from "node:child_process";
import { fileURLToPath } from "node:url";
import { expect, test } from "@rstest/core";

test("frontend verification covers draft and stacked pull requests", () => {
  const workflowPath = fileURLToPath(
    new URL("../../.github/workflows/frontend-ci.yml", import.meta.url)
  );
  const parsed = spawnSync(
    "bun",
    [
      "--eval",
      "const workflow = Bun.YAML.parse(await Bun.file(process.argv[1]).text()); process.stdout.write(JSON.stringify(workflow.on));",
      workflowPath,
    ],
    { encoding: "utf8" }
  );

  expect(parsed.status, parsed.stderr).toBe(0);
  expect(JSON.parse(parsed.stdout)).toEqual({
    pull_request: {
      types: ["opened", "synchronize", "reopened", "ready_for_review"],
    },
  });
});
