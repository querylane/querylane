import { execFileSync } from "node:child_process";
import { createHash } from "node:crypto";
import { existsSync, lstatSync, readdirSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { env } from "node:process";

interface LighthouseBuildOwner {
  build: () => void;
  output: () => string;
  source: () => string;
}
interface LighthouseBuildIdentity {
  output: string;
  source: string;
}

function prepareLighthouseBuild(
  owner: LighthouseBuildOwner
): LighthouseBuildIdentity {
  const source = owner.source();
  owner.build();
  if (source !== owner.source()) {
    throw new Error("Source changed during the production build");
  }
  return { source, output: owner.output() };
}

function verifyLighthouseBuild(
  expected: LighthouseBuildIdentity,
  current: LighthouseBuildIdentity
) {
  if (
    expected.source !== current.source ||
    expected.output !== current.output
  ) {
    throw new Error(
      "Source or production output changed during Lighthouse collection"
    );
  }
}

function digest(value: string | Buffer) {
  return createHash("sha256").update(value).digest("hex");
}

function lighthouseSourceIdentity(root: string): string {
  const revision = execFileSync("git", ["rev-parse", "HEAD"], {
    cwd: root,
    encoding: "utf8",
  }).trim();
  const files = [
    ...new Set(
      execFileSync(
        "git",
        ["ls-files", "--cached", "--others", "--exclude-standard", "-z", "."],
        { cwd: root, encoding: "utf8" }
      )
        .split("\0")
        .filter(Boolean)
    ),
  ].toSorted();
  const inputs = files.map((file) => [
    file,
    existsSync(join(root, file))
      ? digest(readFileSync(join(root, file)))
      : "deleted",
  ]);
  const dotenv = readdirSync(root)
    .toSorted()
    .flatMap((file) =>
      (file === ".env" || file.startsWith(".env.")) &&
      lstatSync(join(root, file)).isFile()
        ? [[file, digest(readFileSync(join(root, file)))]]
        : []
    );
  const environment = Object.entries(env)
    .filter(
      ([key]) =>
        key.startsWith("PUBLIC_") ||
        key.startsWith("QUERYLANE_") ||
        ["NODE_ENV", "BROWSERSLIST_ENV", "RSDOCTOR"].includes(key)
    )
    .toSorted(([left], [right]) => left.localeCompare(right));
  // Only digests are persisted; no dotenv contents or environment values.
  return digest(JSON.stringify({ revision, inputs, dotenv, environment }));
}

function lighthouseOutputIdentity(root: string): string {
  // Reports are diagnostics, not app assets. All other output, including fonts,
  // maps and copied scripts, participates in the immutable collection bracket.
  const entries = readdirSync(root, { recursive: true, encoding: "utf8" })
    .toSorted()
    .flatMap((file) => {
      if (file.replaceAll("\\", "/").startsWith("lighthouse/")) {
        return [];
      }
      const status = lstatSync(join(root, file));
      if (status.isSymbolicLink()) {
        throw new Error("Production output must not contain symbolic links");
      }
      return status.isFile()
        ? [[file, digest(readFileSync(join(root, file)))]]
        : [];
    });
  if (!existsSync(join(root, "index.html"))) {
    throw new Error("Production build did not emit index.html");
  }
  return digest(JSON.stringify(entries));
}

function assertRegularLighthouseBuild(
  environment: Readonly<Record<string, string | undefined>>
) {
  if (
    (environment["RSDOCTOR"] ?? "") !== "" ||
    [
      "QUERYLANE_REACT_PROFILE",
      "QUERYLANE_VISUAL_HARNESS",
      "QUERYLANE_REACT_SCAN",
    ].some((key) => environment[key] === "1")
  ) {
    throw new Error(
      "Lighthouse evidence requires ordinary production output, not diagnostic or harness builds"
    );
  }
}

export {
  assertRegularLighthouseBuild,
  lighthouseOutputIdentity,
  lighthouseSourceIdentity,
  prepareLighthouseBuild,
  verifyLighthouseBuild,
};
