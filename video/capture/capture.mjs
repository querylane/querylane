// Captures real screenshots and interaction recordings from demo.querylane.net
// for the Remotion showcase video. Run from the repo root:
//
//   node video/capture/capture.mjs
//
// Uses the Playwright install from frontend/node_modules.
import { mkdir, rename, readdir, rm } from "node:fs/promises";
import { createRequire } from "node:module";
import path from "node:path";
import { fileURLToPath } from "node:url";

const here = path.dirname(fileURLToPath(import.meta.url));
const require = createRequire(
  path.join(here, "..", "..", "frontend", "package.json"),
);
const { chromium } = require("playwright");

const BASE = "https://demo.querylane.net";
const INSTANCE = `${BASE}/instances/demo-seed-neon`;
const DB = `${INSTANCE}/databases/demo_ecommerce`;
const EXPLORER_TABLE = `${DB}/explorer?category=tables&name=customers&schema=public`;
// Role detail URLs use the base64url-encoded role name as the id.
const ROLE_ID = "ZGVtb19yZWFkb25seQ"; // demo_readonly
const ASSETS = path.join(here, "..", "public");

const VIEWPORT = { width: 1920, height: 1080 };

const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

async function settle(page, ms = 3500) {
  await page.waitForLoadState("networkidle").catch(() => {});
  await sleep(ms);
}

async function still(context, name, url, prepare) {
  const page = await context.newPage();
  await page.goto(url, { waitUntil: "domcontentloaded" });
  await settle(page);
  if (prepare) {
    await prepare(page);
  }
  await page.screenshot({ path: path.join(ASSETS, `${name}.png`) });
  console.log(`captured ${name}.png`);
  await page.close();
}

async function recordClip(browser, name, run) {
  const context = await browser.newContext({
    viewport: VIEWPORT,
    deviceScaleFactor: 1,
    colorScheme: "dark",
    recordVideo: { dir: ASSETS, size: VIEWPORT },
  });
  const page = await context.newPage();
  await run(page);
  const video = page.video();
  await page.close();
  await context.close();
  if (video) {
    const src = await video.path();
    await rename(src, path.join(ASSETS, `${name}.webm`));
    console.log(`recorded ${name}.webm`);
  }
}

// Pass --only-clips to skip the stills (and keep existing assets).
const onlyClips = process.argv.includes("--only-clips");

async function main() {
  if (!onlyClips) {
    await rm(ASSETS, { recursive: true, force: true });
  }
  await mkdir(ASSETS, { recursive: true });

  const browser = await chromium.launch();
  const context = await browser.newContext({
    viewport: VIEWPORT,
    deviceScaleFactor: 2,
    colorScheme: "dark",
  });

  // --- Stills ---
  if (onlyClips) {
    await context.close();
    await recordClips(browser);
    await browser.close();
    return;
  }
  await still(context, "instance-overview", INSTANCE);
  await still(context, "instance-health", INSTANCE, async (page) => {
    await page
      .getByRole("heading", { name: "Health" })
      .scrollIntoViewIfNeeded()
      .catch(() => {});
    await sleep(800);
  });
  await still(context, "database-overview", DB);
  await still(context, "table-data", EXPLORER_TABLE);
  await still(context, "table-data-filter", EXPLORER_TABLE, async (page) => {
    await page.getByRole("button", { name: "Filter" }).first().click();
    await sleep(900);
  });
  await still(context, "table-columns", `${EXPLORER_TABLE}&tab=columns`);
  await still(context, "table-indexes", `${EXPLORER_TABLE}&tab=indexes`);
  await still(context, "roles", `${INSTANCE}/roles`);
  await still(context, "roles-map", `${INSTANCE}/roles?tab=map`);
  await still(
    context,
    "role-access-map",
    `${INSTANCE}/roles/${ROLE_ID}?tab=access-map`,
    async (page) => {
      await sleep(2500);
    },
  );
  await still(context, "role-grants", `${INSTANCE}/roles/${ROLE_ID}?tab=grants`);
  await still(context, "extensions", `${DB}/extensions`);

  await context.close();
  await recordClips(browser);

  await browser.close();

  const files = await readdir(ASSETS);
  console.log(`done: ${files.length} assets in ${ASSETS}`);
}

// --- Interaction clips ---
async function recordClips(browser) {
  await recordClip(browser, "clip-explorer", async (page) => {
    await page.goto(EXPLORER_TABLE, { waitUntil: "domcontentloaded" });
    await settle(page, 4000);
    await page.getByRole("tab", { name: "Columns" }).click();
    await sleep(1800);
    await page.getByRole("tab", { name: "Indexes" }).click();
    await sleep(1800);
    await page.getByRole("tab", { name: "Constraints" }).click();
    await sleep(2200);
    await page.getByRole("tab", { name: "Data" }).click();
    await sleep(1500);
    await page.getByRole("button", { name: "Filter" }).first().click();
    await sleep(2500);
  });

  await recordClip(browser, "clip-access-map", async (page) => {
    await page.goto(`${INSTANCE}/roles/${ROLE_ID}?tab=access-map`, {
      waitUntil: "domcontentloaded",
    });
    await settle(page, 2500);
    // Pan inside the React Flow canvas itself so the drag moves the map
    // instead of selecting page text.
    const canvas = page.locator(".react-flow__pane").first();
    await canvas.scrollIntoViewIfNeeded();
    await sleep(1200);
    const box = await canvas.boundingBox();
    if (box) {
      const cx = box.x + box.width * 0.5;
      const cy = box.y + box.height * 0.55;
      await page.mouse.move(cx, cy);
      await page.mouse.down();
      await page.mouse.move(cx - 220, cy - 80, { steps: 40 });
      await page.mouse.up();
      await sleep(800);
      await page.mouse.move(cx - 220, cy - 80);
      await page.mouse.down();
      await page.mouse.move(cx + 60, cy + 20, { steps: 40 });
      await page.mouse.up();
    }
    await sleep(4000);
  });
}

await main();
