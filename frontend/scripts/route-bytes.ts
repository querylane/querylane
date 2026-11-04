import { spawnSync } from "node:child_process";
import {
  existsSync,
  mkdirSync,
  readdirSync,
  readFileSync,
  writeFileSync,
} from "node:fs";
import { dirname, join, resolve } from "node:path";
import process, { env as processEnv } from "node:process";
import {
  collectRouteInventory,
  compareRouteInventories,
  type RouteInventory,
  routeBytes,
  sha256,
  validateRouteInventory,
} from "./route-byte-inventory";
import { readGeneratedRoutes } from "./route-graph";

const COMMAND_BUFFER_BYTES = 16_777_216;
const COMPARE_ARGUMENT_COUNT = 5;
const CODE_ASSET = /\.(?:js|css)$/u;
const ROOT = resolve(import.meta.dirname, "..");
const HELP = `Route emitted-byte evidence (informational, existing caps remain blocking)
Usage:
  bun run bundle:routes build <output.json>
  bun run bundle:routes compare <base.json> <head.json> <base-sha> <head-sha> <output.json>
Build runs the normal profile contracts and byte checks serially, records exact
source/output identity, and rejects source changes during compilation. Dirty
builds are probes only. Compare requires clean exact revisions and matching
lockfile/toolchain; missing or invalid input exits nonzero. No baseline fallback.
`;

function command(program: string, args: string[]) {
  const result = spawnSync(program, args, {
    cwd: ROOT,
    encoding: "utf8",
    maxBuffer: COMMAND_BUFFER_BYTES,
  });
  if (result.status !== 0 || result.error) {
    throw new Error(
      `${program} ${args.join(" ")} failed: ${result.error?.message ?? result.stderr ?? result.stdout}`
    );
  }
  return result.stdout.trim();
}
function snapshot() {
  const files = command("git", [
    "ls-files",
    "--cached",
    "--others",
    "--exclude-standard",
    "-z",
    ".",
  ])
    .split("\0")
    .filter(Boolean)
    .toSorted();
  return sha256(
    [...new Set(files)]
      .map(
        (file) =>
          `${file}\0${existsSync(join(ROOT, file)) ? sha256(readFileSync(join(ROOT, file))) : "deleted"}`
      )
      .join("\n")
  );
}
function save(path: string, value: unknown) {
  mkdirSync(dirname(resolve(path)), { recursive: true });
  writeFileSync(path, `${JSON.stringify(value, null, 2)}\n`);
}
function summary(inventory: RouteInventory) {
  return [
    "# Route emitted gzip inventory",
    "",
    `Revision: ${inventory.metadata.revision}; dirty: ${inventory.metadata.dirty}; source SHA-256: ${inventory.metadata.sourceHash}`,
    `Build hash: ${inventory.buildHash}; graph SHA-256: ${inventory.metadata.graphHash}`,
    "Comparison: unavailable (no exact base inventory supplied). No measured growth or pass claimed.",
    "",
    "Bytes are gzip of actual emitted JavaScript/CSS plus index.html, not module estimates. Initial includes entry assets and HTML. Reachable is the chunk-graph dependency envelope, including optional async descendants, NOT observed navigation transfer. Direct excludes initial; transitive excludes direct/initial. Shared overlaps direct/transitive and means reachable from multiple routes. Route envelopes overlap: never sum routes as total.",
    "",
    "| Route ID | Direct | Transitive | Shared (overlap) | Initial | Reachable additional |",
    "| --- | ---: | ---: | ---: | ---: | ---: |",
    ...inventory.routes.map((route) => {
      const bytes = routeBytes(inventory, route);
      return `| ${route.id} | ${bytes.direct} | ${bytes.transitive} | ${bytes.shared} | ${bytes.initial} | ${bytes.reachable} |`;
    }),
    "",
  ].join("\n");
}
function buildEnvironmentHash() {
  const variables = Object.entries(processEnv)
    .filter(
      ([key]) =>
        key.startsWith("PUBLIC_") ||
        key.startsWith("QUERYLANE_") ||
        ["NODE_ENV", "RSDOCTOR", "BROWSERSLIST_ENV"].includes(key)
    )
    .toSorted(([left], [right]) => left.localeCompare(right));
  const files = readdirSync(ROOT)
    .filter((name) => name === ".env" || name.startsWith(".env."))
    .toSorted()
    .map((name) => [name, sha256(readFileSync(join(ROOT, name)))]);
  // Record hashes, never dotenv contents or environment values in artifacts.
  return sha256(JSON.stringify({ variables, files }));
}
function emittedIdentity() {
  const directory = join(ROOT, "dist");
  const paths = [
    "index.html",
    ...readdirSync(directory, { recursive: true, encoding: "utf8" }).filter(
      (path) => CODE_ASSET.test(path)
    ),
  ].toSorted();
  return sha256(
    paths
      .map((path) => `${path}\0${sha256(readFileSync(join(directory, path)))}`)
      .join("\n")
  );
}
function buildScript(script: string) {
  const result = spawnSync("bun", ["run", script], {
    cwd: ROOT,
    stdio: "inherit",
  });
  if (result.status !== 0 || result.error) {
    throw new Error(`${script} failed; inventory unavailable`);
  }
}
async function build(output: string) {
  const sourceHash = snapshot();
  const environmentHash = buildEnvironmentHash();
  const revision = command("git", ["rev-parse", "HEAD"]);
  const dirty = command("git", ["status", "--porcelain", "--", "."]).length > 0;
  const lockHash = sha256(readFileSync(join(ROOT, "bun.lock")));
  const configHash = sha256(
    [
      "rsbuild.config.ts",
      "rsbuild.performance.ts",
      "package.json",
      ".browserslistrc",
    ]
      .map((path) => readFileSync(join(ROOT, path), "utf8"))
      .join("\0")
  );
  const toolchain = `node=${process.version};bun=${command("bun", ["--version"])};platform=${process.platform};arch=${process.arch}`;
  // Capture process output outside dist so a later harness build cannot erase it.
  buildScript("build");
  const productionIdentity = emittedIdentity();
  buildScript("build:profile:bundle");
  if (productionIdentity !== emittedIdentity()) {
    throw new Error(
      "Profile assets differ from byte-checked production assets; inventory unavailable"
    );
  }
  if (sourceHash !== snapshot() || environmentHash !== buildEnvironmentHash()) {
    throw new Error(
      "Source changed during build; inventory unavailable. Retry after owners finish."
    );
  }
  const graphText = readFileSync(join(ROOT, "dist/rsdoctor-data.json"), "utf8");
  const routes = await readGeneratedRoutes(
    readFileSync(join(ROOT, "src/routeTree.gen.ts"), "utf8")
  );
  for (const id of [
    "/instances/$instanceId/",
    "/instances/$instanceId/databases/$databaseId/explorer",
    "/instances/$instanceId/databases/$databaseId/workbench",
  ]) {
    if (!routes.some((route) => route.id === id)) {
      throw new Error(`Missing representative installed route ${id}`);
    }
  }
  const inventory = collectRouteInventory({
    report: JSON.parse(graphText),
    distDir: join(ROOT, "dist"),
    routes,
    metadata: {
      revision,
      dirty,
      sourceHash,
      lockHash,
      configHash,
      toolchain,
      graphHash: sha256(graphText),
      buildEnvironmentHash: environmentHash,
    },
  });
  if (sourceHash !== snapshot() || environmentHash !== buildEnvironmentHash()) {
    throw new Error(
      "Source changed while collecting inventory; retry after owners finish."
    );
  }
  save(output, inventory);
  writeFileSync(`${output}.md`, summary(inventory));
  console.log(
    `Wrote ${output}; ${inventory.routes.length} route inventories. Comparison unavailable; this is not a growth pass.`
  );
}
async function main(args: string[]) {
  const [mode, ...values] = args;
  if (mode === "--help" || mode === "-h") {
    console.log(HELP);
    return;
  }
  if (mode === "build" && values.length === 1 && values[0] !== undefined) {
    await build(values[0]);
    return;
  }
  if (mode === "compare" && values.length === COMPARE_ARGUMENT_COUNT) {
    const [basePath, headPath, base, head, output] = values;
    if (
      basePath === undefined ||
      headPath === undefined ||
      base === undefined ||
      head === undefined ||
      output === undefined
    ) {
      throw new Error(HELP);
    }
    const before = validateRouteInventory(
      JSON.parse(readFileSync(basePath, "utf8"))
    );
    const after = validateRouteInventory(
      JSON.parse(readFileSync(headPath, "utf8"))
    );
    const result = compareRouteInventories(before, after, { base, head });
    save(output, result);
    console.log(JSON.stringify(result));
    return;
  }
  throw new Error(HELP);
}
if (import.meta.main) {
  try {
    await main(process.argv.slice(2));
  } catch (error) {
    console.error(error instanceof Error ? error.message : String(error));
    process.exitCode = 1;
  }
}
