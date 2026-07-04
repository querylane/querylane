#!/usr/bin/env bun

import { spawn, spawnSync } from "node:child_process";
import {
  copyFileSync,
  existsSync,
  mkdirSync,
  readFileSync,
  writeFileSync,
} from "node:fs";
import net from "node:net";
import path from "node:path";
import crypto from "node:crypto";

const helpText = `Querylane per-worktree local environment

Usage:
  bun run setup:worktree [options]

Default: start a worktree-scoped meta DB, seed DBs, backend, and frontend.

Options:
  --setup-only              Create config/env, start databases, run meta DB migrations, then exit
  --no-seed                 Skip seed PostgreSQL instances
  --reset                   Recreate this worktree's Docker containers before starting
  --stop                    Stop/remove this worktree's Docker containers (keeps volumes)
  --clean                   Stop/remove this worktree's Docker containers and volumes
  --copy-dotenv             Copy missing ignored dotenv files from the main worktree
  --main-worktree <path>    Source worktree for --copy-dotenv (auto-detects main/master by default)
  --postgres-port <port>    Override meta PostgreSQL host port
  --backend-port <port>     Override backend port
  --frontend-port <port>    Override frontend port
  --seed-normal-port <port> Override ecommerce seed PostgreSQL host port
  --seed-edge-port <port>   Override edge-cases seed PostgreSQL host port
  --reallocate-ports        Ignore saved .worktree port manifest and pick free ports again
  --no-install              Skip frontend bun install before starting
  -h, --help                Show this help
`;

const defaultEnv = {
  POSTGRES_USER: "querylane",
  POSTGRES_PASSWORD: "querylane",
  POSTGRES_DB: "querylane_dev",
  SEED_NORMAL_USER: "seeduser",
  SEED_NORMAL_PASSWORD: "seedpass",
  SEED_EDGE_USER: "seeduser",
  SEED_EDGE_PASSWORD: "seedpass",
};

const portNames = [
  "postgres",
  "backend",
  "frontend",
  "seedNormal",
  "seedEdge",
];

const dotenvCopyRelPaths = [
  ".env",
  ".env.local",
  "frontend/.env",
  "frontend/.env.local",
];

main().catch((error) => {
  console.error(`\n❌ ${error instanceof Error ? error.message : String(error)}`);
  process.exit(1);
});

async function main() {
  const options = parseArgs(process.argv.slice(2));
  if (options.help) {
    process.stdout.write(helpText);
    return;
  }

  const root = git(["rev-parse", "--show-toplevel"], process.cwd());
  const ctx = await buildContext(root, options);

  if (options.copyDotenv) {
    copyDotenvFromMainWorktree(ctx, options);
  }

  writeGeneratedFiles(ctx, options);

  if (options.command === "clean" || options.command === "stop") {
    stopContainers(ctx, options.command === "clean");
    return;
  }

  preflight();

  if (options.reset) {
    stopContainers(ctx, true);
  }

  startContainers(ctx, options);

  if (options.seed) {
    await waitForSeedData(ctx);
  }

  if (options.setupOnly) {
    runMetaMigrations(ctx);
    printSummary(ctx, options, "setup-only");
    return;
  }

  if (!options.noInstall) {
    run("bun", ["install", "--frozen-lockfile"], { cwd: ctx.frontendDir });
  }

  printSummary(ctx, options, "run");
  await startAppProcesses(ctx);
}

function parseArgs(argv) {
  const options = {
    command: "run",
    copyDotenv: false,
    help: false,
    noInstall: false,
    reallocatePorts: false,
    reset: false,
    seed: true,
    setupOnly: false,
    overrides: {},
    mainWorktree: undefined,
  };

  for (let index = 0; index < argv.length; index += 1) {
    const raw = argv[index];
    const [flag, inlineValue] = raw.split(/=(.*)/s, 2);
    const nextValue = () => {
      if (inlineValue !== undefined) {
        return inlineValue;
      }
      index += 1;
      if (index >= argv.length) {
        throw new Error(`${flag} requires a value`);
      }
      return argv[index];
    };

    switch (flag) {
      case "-h":
      case "--help":
        options.help = true;
        break;
      case "--setup-only":
        options.setupOnly = true;
        break;
      case "--no-seed":
        options.seed = false;
        break;
      case "--reset":
        options.reset = true;
        break;
      case "--stop":
        options.command = "stop";
        break;
      case "--clean":
        options.command = "clean";
        break;
      case "--copy-dotenv":
        options.copyDotenv = true;
        break;
      case "--main-worktree":
        options.mainWorktree = path.resolve(nextValue());
        break;
      case "--postgres-port":
        options.overrides.postgres = parsePort(nextValue(), flag);
        break;
      case "--backend-port":
        options.overrides.backend = parsePort(nextValue(), flag);
        break;
      case "--frontend-port":
        options.overrides.frontend = parsePort(nextValue(), flag);
        break;
      case "--seed-normal-port":
        options.overrides.seedNormal = parsePort(nextValue(), flag);
        break;
      case "--seed-edge-port":
        options.overrides.seedEdge = parsePort(nextValue(), flag);
        break;
      case "--reallocate-ports":
        options.reallocatePorts = true;
        break;
      case "--no-install":
        options.noInstall = true;
        break;
      default:
        throw new Error(`Unknown option: ${raw}\n\n${helpText}`);
    }
  }

  return options;
}

function parsePort(value, flag) {
  const port = Number(value);
  if (!Number.isInteger(port) || port < 1 || port > 65_535) {
    throw new Error(`${flag} must be a TCP port between 1 and 65535`);
  }
  return port;
}

async function buildContext(root, options) {
  const worktreeDir = path.join(root, ".worktree");
  const manifestPath = path.join(worktreeDir, "querylane-worktree.json");
  mkdirSync(worktreeDir, { recursive: true });

  const branch = currentBranch(root);
  const rootHash = crypto.createHash("sha256").update(root).digest("hex").slice(0, 8);
  const slug = slugify(branch);
  const projectName = truncateComposeProjectName(`querylane-${slug}-${rootHash}`);

  const loadedManifest = !options.reallocatePorts ? readJSONIfExists(manifestPath) : undefined;
  const preferredPorts = preferredPortsForRoot(rootHash);
  const ports = loadedManifest?.ports
    ? { ...loadedManifest.ports, ...options.overrides }
    : await allocatePorts(preferredPorts, options.overrides);

  validatePortManifest(ports);
  validateUniquePorts(ports);

  const ctx = {
    root,
    branch,
    projectName: loadedManifest?.projectName && !options.reallocatePorts ? loadedManifest.projectName : projectName,
    worktreeDir,
    frontendDir: path.join(root, "frontend"),
    backendConfigPath: path.join(worktreeDir, "dev-worktree.yaml"),
    dockerEnvPath: path.join(worktreeDir, "docker.env"),
    frontendEnvPath: path.join(worktreeDir, "frontend.env"),
    manifestPath,
    ports,
    env: buildWorktreeEnv(root, ports),
  };

  writeJSON(manifestPath, {
    version: 1,
    root,
    branch,
    projectName: ctx.projectName,
    ports,
  });

  return ctx;
}

function currentBranch(root) {
  const branch = tryGit(["branch", "--show-current"], root);
  if (branch) {
    return branch;
  }

  const shortSha = tryGit(["rev-parse", "--short", "HEAD"], root) || "unknown";
  return `detached-${shortSha}`;
}

function slugify(value) {
  return value
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 32) || "worktree";
}

function truncateComposeProjectName(value) {
  return value.slice(0, 63).replace(/-+$/g, "") || "querylane-worktree";
}

function preferredPortsForRoot(rootHash) {
  const hashNumber = Number.parseInt(rootHash.slice(0, 6), 16);
  const base = 20_000 + (hashNumber % 3_000) * 10;

  return {
    postgres: base,
    backend: base + 1,
    frontend: base + 2,
    seedNormal: base + 3,
    seedEdge: base + 4,
  };
}

async function allocatePorts(preferredPorts, overrides) {
  const used = new Set();
  const ports = {};

  for (const name of portNames) {
    if (overrides[name] !== undefined) {
      if (used.has(overrides[name])) {
        throw new Error(`Port ${overrides[name]} assigned more than once`);
      }
      ports[name] = overrides[name];
      used.add(overrides[name]);
      continue;
    }

    ports[name] = await findFreePort(preferredPorts[name], used);
    used.add(ports[name]);
  }

  return ports;
}

async function findFreePort(preferred, reserved) {
  for (let port = preferred; port <= 65_535; port += 1) {
    if (!reserved.has(port) && await isPortFree(port)) {
      return port;
    }
  }

  for (let port = 10_240; port < preferred; port += 1) {
    if (!reserved.has(port) && await isPortFree(port)) {
      return port;
    }
  }

  throw new Error("Could not find a free local TCP port");
}

function isPortFree(port) {
  return new Promise((resolve) => {
    const server = net.createServer();
    server.once("error", () => resolve(false));
    server.once("listening", () => {
      server.close(() => resolve(true));
    });
    server.listen(port, "0.0.0.0");
  });
}

function validatePortManifest(ports) {
  for (const name of portNames) {
    parsePort(String(ports[name]), name);
  }
}

function validateUniquePorts(ports) {
  const seen = new Map();
  for (const name of portNames) {
    const owner = seen.get(ports[name]);
    if (owner) {
      throw new Error(`Port ${ports[name]} assigned to both ${owner} and ${name}`);
    }
    seen.set(ports[name], name);
  }
}

function buildWorktreeEnv(root, ports) {
  const devEnv = parseDotenvFiles([
    path.join(root, ".env.development"),
    path.join(root, "seed", ".env.seed"),
  ]);

  return {
    ...defaultEnv,
    ...devEnv,
    COMPOSE_PROJECT_NAME: "",
    QUERYLANE_POSTGRES_PORT: String(ports.postgres),
    QUERYLANE_SEED_NORMAL_PORT: String(ports.seedNormal),
    QUERYLANE_SEED_EDGE_PORT: String(ports.seedEdge),
  };
}

function writeGeneratedFiles(ctx, options) {
  const dockerEnv = {
    ...ctx.env,
    COMPOSE_PROJECT_NAME: ctx.projectName,
  };

  writeFileSync(
    ctx.dockerEnvPath,
    [
      "# Generated by scripts/setup-worktree.mjs. Safe to delete; it will be recreated.",
      ...Object.entries(dockerEnv).map(([key, value]) => `${key}=${formatEnvValue(value)}`),
      "",
    ].join("\n")
  );

  writeFileSync(ctx.backendConfigPath, backendConfigYAML(ctx, options));
  writeFileSync(
    ctx.frontendEnvPath,
    `# Generated by scripts/setup-worktree.mjs.\nPUBLIC_API_BASE_URL=http://127.0.0.1:${ctx.ports.backend}\n`
  );
}

function backendConfigYAML(ctx, options) {
  const postgresUser = ctx.env.POSTGRES_USER;
  const postgresPassword = ctx.env.POSTGRES_PASSWORD;
  const postgresDatabase = ctx.env.POSTGRES_DB;
  const metaDSN = postgresDSN({
    user: postgresUser,
    password: postgresPassword,
    host: "localhost",
    port: ctx.ports.postgres,
    database: postgresDatabase,
  });

  const lines = [
    "# Generated by scripts/setup-worktree.mjs. Safe to delete; it will be recreated.",
    "database:",
    `  dsn: ${yamlString(metaDSN)}`,
    "",
  ];

  if (options.seed) {
    lines.push(
      "instances:",
      "  - id: seed-normal",
      "    display_name: \"Seed: Ecommerce\"",
      "    host: \"localhost\"",
      `    port: ${ctx.ports.seedNormal}`,
      "    database: \"ecommerce\"",
      `    username: ${yamlString(ctx.env.SEED_NORMAL_USER)}`,
      `    password: ${yamlString(ctx.env.SEED_NORMAL_PASSWORD)}`,
      "    ssl_mode: \"disable\"",
      "    labels:",
      "      env: seed",
      "      worktree: true",
      "",
      "  - id: seed-edgecases",
      "    display_name: \"Seed: Edge Cases\"",
      "    host: \"localhost\"",
      `    port: ${ctx.ports.seedEdge}`,
      "    database: \"postgres\"",
      `    username: ${yamlString(ctx.env.SEED_EDGE_USER)}`,
      `    password: ${yamlString(ctx.env.SEED_EDGE_PASSWORD)}`,
      "    ssl_mode: \"disable\"",
      "    labels:",
      "      env: seed",
      "      worktree: true",
      ""
    );
  }

  lines.push(
    "http:",
    "  host: 127.0.0.1",
    `  port: ${ctx.ports.backend}`,
    "  access_log: false",
    ""
  );

  return `${lines.join("\n")}\n`;
}

function postgresDSN({ user, password, host, port, database }) {
  const encodedUser = encodeURIComponent(user);
  const encodedPassword = encodeURIComponent(password);
  const encodedDatabase = encodeURIComponent(database);
  return `postgres://${encodedUser}:${encodedPassword}@${host}:${port}/${encodedDatabase}?sslmode=disable`;
}

function yamlString(value) {
  return JSON.stringify(String(value));
}

function formatEnvValue(value) {
  const text = String(value);
  if (/^[A-Za-z0-9_./:@%+-]+$/.test(text)) {
    return text;
  }
  return JSON.stringify(text);
}

function preflight() {
  requireCommand("docker", ["--version"]);
  requireCommand("task", ["--version"]);
  requireCommand("bun", ["--version"]);
  run("docker", ["info"], { stdio: "ignore" });
}

function requireCommand(command, args) {
  const result = spawnSync(command, args, { encoding: "utf8", stdio: "ignore" });
  if (result.error || result.status !== 0) {
    throw new Error(`Required command not available: ${command}`);
  }
}

function startContainers(ctx, options) {
  const files = composeFileArgs(ctx.root, options.seed);
  run("docker", [
    "compose",
    "--env-file",
    ctx.dockerEnvPath,
    "-p",
    ctx.projectName,
    ...files,
    "up",
    "-d",
    "--wait",
  ], { cwd: ctx.root });
}

function stopContainers(ctx, removeVolumes) {
  const args = [
    "compose",
    "--env-file",
    ctx.dockerEnvPath,
    "-p",
    ctx.projectName,
    ...composeFileArgs(ctx.root, true),
    "down",
    "--remove-orphans",
  ];

  if (removeVolumes) {
    args.push("-v");
  }

  run("docker", args, { cwd: ctx.root });
}

function composeFileArgs(root, includeSeed) {
  const args = ["-f", path.join(root, "docker-compose.yaml")];
  if (includeSeed) {
    args.push("-f", path.join(root, "docker-compose.seed.yaml"));
  }
  return args;
}

async function waitForSeedData(ctx) {
  await waitForDockerSQL(ctx, "pg-normal", ctx.env.SEED_NORMAL_USER, "ecommerce", "ecommerce seed DB");
  await waitForDockerSQL(ctx, "pg-edgecases", ctx.env.SEED_EDGE_USER, "normal_db", "edge-case seed DB");
}

async function waitForDockerSQL(ctx, service, user, database, label) {
  const deadline = Date.now() + 90_000;
  const composePrefix = [
    "compose",
    "--env-file",
    ctx.dockerEnvPath,
    "-p",
    ctx.projectName,
    ...composeFileArgs(ctx.root, true),
  ];

  process.stdout.write(`⏳ Waiting for ${label}...`);

  while (Date.now() < deadline) {
    const result = spawnSync("docker", [
      ...composePrefix,
      "exec",
      "-T",
      service,
      "psql",
      "-U",
      user,
      "-d",
      database,
      "-v",
      "ON_ERROR_STOP=1",
      "-qAt",
      "-c",
      "select 1",
    ], { cwd: ctx.root, encoding: "utf8", stdio: "ignore" });

    if (result.status === 0) {
      process.stdout.write(" ready\n");
      return;
    }

    process.stdout.write(".");
    await sleep(1_000);
  }

  process.stdout.write(" timed out\n");
  console.warn(`⚠️  ${label} not ready yet. Seeders keep running; Querylane should recover when data appears.`);
}

function runMetaMigrations(ctx) {
  run("task", ["backend:start", "--", "migrate", "up", `--config=${ctx.backendConfigPath}`], {
    cwd: ctx.root,
    env: backendEnv(),
  });
}

async function startAppProcesses(ctx) {
  const backend = spawn("task", ["backend:start", "--", "server", "start", `--config=${ctx.backendConfigPath}`], {
    cwd: ctx.root,
    env: backendEnv(),
    stdio: "inherit",
  });

  const frontend = spawn("bun", ["dev", "--host", "127.0.0.1", "--port", String(ctx.ports.frontend)], {
    cwd: ctx.frontendDir,
    env: frontendEnv(ctx),
    stdio: "inherit",
  });

  const children = [
    { name: "backend", proc: backend },
    { name: "frontend", proc: frontend },
  ];

  let shuttingDown = false;
  const shutdown = (reason, exitCode = 0) => {
    if (shuttingDown) {
      return;
    }
    shuttingDown = true;
    console.log(`\n🛑 Shutting down app processes (${reason}). Docker containers stay up; use --stop or --clean for them.`);
    for (const child of children) {
      if (isChildRunning(child)) {
        child.proc.kill("SIGTERM");
      }
    }

    const pendingChildren = children.filter(isChildRunning);
    if (pendingChildren.length === 0) {
      process.exit(exitCode);
    }

    let remainingChildren = pendingChildren.length;
    let forceExitTimer;

    const exitWhenAllChildrenStop = () => {
      remainingChildren -= 1;
      if (remainingChildren === 0) {
        clearTimeout(forceExitTimer);
        process.exit(exitCode);
      }
    };

    for (const child of pendingChildren) {
      child.proc.once("exit", exitWhenAllChildrenStop);
    }

    forceExitTimer = setTimeout(() => {
      for (const child of children) {
        if (isChildRunning(child)) {
          child.proc.kill("SIGKILL");
        }
      }
      process.exit(exitCode);
    }, 5_000);
  };

  process.on("SIGINT", () => shutdown("SIGINT"));
  process.on("SIGTERM", () => shutdown("SIGTERM"));

  const firstExit = await Promise.race(children.map((child) => childExit(child)));
  if (!shuttingDown) {
    shutdown(`${firstExit.name} exited`, firstExit.code ?? 1);
  }
}

function isChildRunning(child) {
  return child.proc.exitCode === null && child.proc.signalCode === null;
}

function childExit(child) {
  return new Promise((resolve) => {
    child.proc.on("error", (error) => {
      resolve({ name: child.name, code: 1, error });
    });
    child.proc.on("exit", (code, signal) => {
      resolve({ name: child.name, code, signal });
    });
  });
}

function backendEnv() {
  const env = { ...process.env };
  for (const key of Object.keys(env)) {
    if (key.startsWith("QUERYLANE_")) {
      delete env[key];
    }
  }
  return env;
}

function frontendEnv(ctx) {
  const dotenvEnv = parseDotenvFiles([
    path.join(ctx.root, ".env.development"),
    path.join(ctx.root, ".env"),
    path.join(ctx.root, ".env.local"),
    path.join(ctx.frontendDir, ".env"),
    path.join(ctx.frontendDir, ".env.local"),
  ]);

  return {
    ...dotenvEnv,
    ...process.env,
    PUBLIC_API_BASE_URL: `http://127.0.0.1:${ctx.ports.backend}`,
  };
}

function printSummary(ctx, options, mode) {
  console.log("\n✅ Querylane worktree environment ready");
  console.log(`   Worktree: ${ctx.root}`);
  console.log(`   Docker project: ${ctx.projectName}`);
  console.log(`   Backend config: ${ctx.backendConfigPath}`);
  console.log(`   Meta DB: localhost:${ctx.ports.postgres}`);
  if (options.seed) {
    console.log(`   Seed ecommerce DB: localhost:${ctx.ports.seedNormal}`);
    console.log(`   Seed edge-case DB: localhost:${ctx.ports.seedEdge}`);
  }
  console.log(`   Backend: http://127.0.0.1:${ctx.ports.backend}`);
  console.log(`   Frontend: http://127.0.0.1:${ctx.ports.frontend}`);
  if (mode === "run") {
    console.log("\nPress Ctrl+C to stop backend/frontend. Containers remain for fast reruns.");
    console.log("Use: bun run setup:worktree -- --stop   # stop containers");
    console.log("Use: bun run setup:worktree -- --clean  # stop containers + delete volumes\n");
  }
}

function copyDotenvFromMainWorktree(ctx, options) {
  const sourceRoot = options.mainWorktree || detectMainWorktree(ctx.root);
  if (!sourceRoot) {
    console.warn("⚠️  Could not find main/master worktree for dotenv copy. Use --main-worktree <path>.");
    return;
  }

  for (const relPath of dotenvCopyRelPaths) {
    const source = path.join(sourceRoot, relPath);
    const target = path.join(ctx.root, relPath);
    if (!existsSync(source) || existsSync(target)) {
      continue;
    }
    mkdirSync(path.dirname(target), { recursive: true });
    copyFileSync(source, target);
    console.log(`📋 Copied ${relPath} from ${sourceRoot}`);
  }
}

function detectMainWorktree(root) {
  const output = tryGit(["worktree", "list", "--porcelain"], root);
  if (!output) {
    return undefined;
  }

  const entries = [];
  let current;
  for (const line of output.split(/\r?\n/)) {
    if (line.startsWith("worktree ")) {
      if (current) {
        entries.push(current);
      }
      current = { path: line.slice("worktree ".length) };
    } else if (current && line.startsWith("branch ")) {
      current.branch = line.slice("branch ".length);
    }
  }
  if (current) {
    entries.push(current);
  }

  return entries.find((entry) => entry.path !== root && entry.branch === "refs/heads/main")?.path
    || entries.find((entry) => entry.path !== root && entry.branch === "refs/heads/master")?.path;
}

function parseDotenvFiles(files) {
  return files.reduce((acc, file) => ({ ...acc, ...parseDotenvFile(file) }), {});
}

function parseDotenvFile(file) {
  if (!existsSync(file)) {
    return {};
  }

  const env = {};
  for (const line of readFileSync(file, "utf8").split(/\r?\n/)) {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith("#")) {
      continue;
    }

    const normalized = trimmed.replace(/^export\s+/, "");
    const match = normalized.match(/^([A-Za-z_][A-Za-z0-9_]*)\s*=\s*(.*)$/s);
    if (!match) {
      continue;
    }

    env[match[1]] = parseDotenvValue(match[2]);
  }
  return env;
}

function parseDotenvValue(value) {
  const trimmed = value.trim();
  if ((trimmed.startsWith('"') && trimmed.endsWith('"')) || (trimmed.startsWith("'") && trimmed.endsWith("'"))) {
    return trimmed.slice(1, -1).replace(/\\n/g, "\n");
  }
  return trimmed;
}

function readJSONIfExists(file) {
  if (!existsSync(file)) {
    return undefined;
  }

  try {
    return JSON.parse(readFileSync(file, "utf8"));
  } catch {
    return undefined;
  }
}

function writeJSON(file, value) {
  writeFileSync(file, `${JSON.stringify(value, null, 2)}\n`);
}

function git(args, cwd) {
  const result = spawnSync("git", args, { cwd, encoding: "utf8" });
  if (result.status !== 0) {
    throw new Error(result.stderr || `git ${args.join(" ")} failed`);
  }
  return result.stdout.trim();
}

function tryGit(args, cwd) {
  const result = spawnSync("git", args, { cwd, encoding: "utf8" });
  if (result.status !== 0) {
    return undefined;
  }
  return result.stdout.trim();
}

function run(command, args, options = {}) {
  const result = spawnSync(command, args, {
    cwd: options.cwd,
    env: options.env || process.env,
    stdio: options.stdio || "inherit",
  });

  if (result.error) {
    throw result.error;
  }

  if (result.status !== 0) {
    throw new Error(`${command} ${args.join(" ")} failed with exit code ${result.status}`);
  }
}

function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}
