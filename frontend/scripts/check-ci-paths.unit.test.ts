import { spawnSync } from "node:child_process";
import {
  existsSync,
  mkdtempSync,
  readFileSync,
  rmSync,
  writeFileSync,
} from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { env } from "node:process";
import { expect, test } from "@rstest/core";

const DETECTION_SCRIPT = / {8}run: \|\n(?<script>(?: {10}.+\n)+)/u;
const INDENT = /^ {10}/gmu;

function detect(paths: string[], gitExit = "0") {
  const workflow = readFileSync(
    new URL("../../.github/workflows/frontend-ci.yml", import.meta.url),
    "utf8"
  );
  const { script } = DETECTION_SCRIPT.exec(workflow)?.groups ?? {};
  if (typeof script !== "string") {
    throw new TypeError("Missing workflow change-detection script");
  }
  const directory = mkdtempSync(join(tmpdir(), "querylane-ci-paths-"));
  const fixture = join(directory, "paths");
  const output = join(directory, "output");
  try {
    writeFileSync(fixture, paths.length > 0 ? `${paths.join("\0")}\0` : "");
    const result = spawnSync(
      "bash",
      [
        "-c",
        `git() { cat "$PATH_FIXTURE"; return "$GIT_EXIT"; }\n${script.replaceAll(INDENT, "")}`,
      ],
      {
        encoding: "utf8",
        env: {
          ...env,
          RUNNER_TEMP: directory,
          GITHUB_OUTPUT: output,
          PATH_FIXTURE: fixture,
          GIT_EXIT: gitExit,
          BASE_SHA: "base",
          HEAD_SHA: "head",
        },
      }
    );
    return {
      status: result.status,
      output: existsSync(output) ? readFileSync(output, "utf8") : "",
    };
  } finally {
    rmSync(directory, { recursive: true, force: true });
  }
}

test("root policy files cannot evade UI checks by using another config filename", () => {
  for (const path of [
    "biome.json",
    "bunfig.toml",
    ".gitignore",
    "package.json",
  ]) {
    expect(detect([path])).toEqual({ status: 0, output: "frontend=true\n" });
  }
});

test("checks all NUL-delimited paths without a changed-file count limit", () => {
  const paths = Array.from(
    { length: 350 },
    (_, index) => `backend/file-${index}.go`
  );
  expect(detect([...paths, "frontend/src/new\nfile.ts"])).toEqual({
    status: 0,
    output: "frontend=true\n",
  });
  expect(detect([".github/workflows/frontend-ci.yml"])).toEqual({
    status: 0,
    output: "frontend=true\n",
  });
  expect(detect(paths)).toEqual({ status: 0, output: "frontend=false\n" });
  expect(detect([])).toEqual({ status: 0, output: "frontend=false\n" });
});

test("a failed git diff cannot emit a successful skip decision", () => {
  const result = detect([], "1");
  expect(result.status).not.toBe(0);
  expect(result.output).toBe("");
});
