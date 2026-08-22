/**
 * Records each demo scene from https://demo.querylane.net via a CDP screencast
 * at 2x device scale, then assembles public/clips/<scene>.mp4 with ffmpeg.
 *
 *   bun run record.ts            # all scenes
 *   bun run record.ts filter fk  # only some
 */
import { execFileSync } from "node:child_process";
import { mkdirSync, rmSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { type CDPSession, type Page, chromium } from "playwright";

const BASE = "https://demo.querylane.net";
const INSTANCE = "demo-ecommerce";
const DB = "demo_ecommerce";
const EXPLORER = `${BASE}/instances/${INSTANCE}/databases/${DB}/explorer`;
const W = 1920;
const H = 1080;
const SCALE = 2;
const FPS = 30;
const OUT = join(import.meta.dirname, "public", "clips");
const TMP = join(import.meta.dirname, ".frames");

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

// The cursor is NOT captured. Cursor events are logged with timestamps and
// rendered in Remotion (smooth easing, click ripple) — Screen-Studio style.
type CursorEvent =
  | { t: number; type: "move"; x: number; y: number; dur: number }
  | { t: number; type: "down"; x: number; y: number }
  | { t: number; type: "up"; x: number; y: number };
const cursorLog: CursorEvent[] = [];
let clock0 = 0;
const now = () => (performance.now() - clock0) / 1000;
let cursorPos = { x: W / 2, y: H / 2 };

// ---------- screencast recorder ----------
class Recorder {
  private frames: { ts: number; file: string }[] = [];
  private dir = "";
  private n = 0;
  private session: CDPSession | null = null;
  private onFrame: ((e: any) => Promise<void>) | null = null;
  firstFrameAt = 0;

  constructor(private page: Page) {}

  async start(id: string) {
    this.dir = join(TMP, id);
    rmSync(this.dir, { recursive: true, force: true });
    mkdirSync(this.dir, { recursive: true });
    this.frames = [];
    this.n = 0;
    this.session = await this.page.context().newCDPSession(this.page);
    this.onFrame = async (e) => {
      if (this.n === 0) this.firstFrameAt = performance.now();
      const file = join(this.dir, `${String(this.n++).padStart(5, "0")}.jpg`);
      writeFileSync(file, Buffer.from(e.data, "base64"));
      this.frames.push({ ts: e.metadata.timestamp, file });
      await this.session?.send("Page.screencastFrameAck", { sessionId: e.sessionId }).catch(() => {});
    };
    this.session.on("Page.screencastFrame", this.onFrame);
    await this.session.send("Page.startScreencast", {
      format: "jpeg",
      quality: 92,
      maxWidth: W * SCALE,
      maxHeight: H * SCALE,
      everyNthFrame: 1,
    });
  }

  async stop(id: string) {
    if (!this.session) return;
    await sleep(150);
    await this.session.send("Page.stopScreencast").catch(() => {});
    await this.session.detach().catch(() => {});
    this.session = null;
    if (this.frames.length < 2) throw new Error(`no frames captured for ${id}`);

    // ffmpeg concat demuxer with per-frame durations -> CFR mp4
    const lines: string[] = [];
    for (let i = 0; i < this.frames.length; i++) {
      const cur = this.frames[i];
      const next = this.frames[i + 1];
      const dur = next ? Math.max(next.ts - cur.ts, 1 / 120) : 1 / FPS;
      lines.push(`file '${cur.file}'`, `duration ${dur.toFixed(5)}`);
    }
    lines.push(`file '${this.frames[this.frames.length - 1].file}'`);
    const list = join(this.dir, "list.txt");
    writeFileSync(list, lines.join("\n"));
    mkdirSync(OUT, { recursive: true });
    const out = join(OUT, `${id}.mp4`);
    execFileSync("ffmpeg", [
      "-y", "-loglevel", "error",
      "-f", "concat", "-safe", "0", "-i", list,
      "-vf", `scale=${W * SCALE}:${H * SCALE}:flags=lanczos,fps=${FPS},format=yuv420p`,
      "-c:v", "libx264", "-preset", "slow", "-crf", "16", "-movflags", "+faststart",
      out,
    ]);
    const secs = this.frames[this.frames.length - 1].ts - this.frames[0].ts;
    console.log(`✔ ${id}: ${this.frames.length} frames, ${secs.toFixed(1)}s -> ${out}`);
  }
}

// ---------- human-like helpers ----------
const easeInOut = (k: number) => (k < 0.5 ? 4 * k * k * k : 1 - Math.pow(-2 * k + 2, 3) / 2);
async function glide(page: Page, x: number, y: number, ms = 500) {
  const from = { ...cursorPos };
  const t = now();
  const ev: CursorEvent = { t, type: "move", x, y, dur: ms / 1000 };
  cursorLog.push(ev);
  const steps = Math.max(8, Math.round(ms / 33));
  for (let i = 1; i <= steps; i++) {
    const k = easeInOut(i / steps);
    await page.mouse.move(from.x + (x - from.x) * k, from.y + (y - from.y) * k);
    await sleep(ms / steps);
  }
  cursorPos = { x, y };
  ev.dur = now() - t; // actual wall time (sleep overhead)
}
async function clickAt(page: Page, x: number, y: number, pause = 400) {
  await glide(page, x, y);
  await sleep(110);
  cursorLog.push({ t: now(), type: "down", x, y });
  await page.mouse.down();
  await sleep(80);
  cursorLog.push({ t: now(), type: "up", x, y });
  await page.mouse.up();
  await sleep(pause);
}
async function smoothWheel(page: Page, dy: number, ms = 500) {
  const steps = Math.round(ms / 25);
  let done = 0;
  for (let i = 1; i <= steps; i++) {
    const target = Math.round(dy * easeInOut(i / steps));
    await page.mouse.wheel(0, target - done);
    done = target;
    await sleep(ms / steps);
  }
}
async function center(page: Page, selector: string, timeout = 15000) {
  const loc = page.locator(selector).first();
  await loc.waitFor({ state: "visible", timeout });
  const box = await loc.boundingBox();
  if (!box) throw new Error(`no box for ${selector}`);
  return { x: box.x + box.width / 2, y: box.y + box.height / 2 };
}
async function clickSel(page: Page, selector: string, pause = 500) {
  const c = await center(page, selector);
  await clickAt(page, c.x, c.y, pause);
}
async function typeSlow(page: Page, text: string, delay = 55) {
  await page.keyboard.type(text, { delay });
}
async function settle(page: Page, ms = 900) {
  await page.waitForLoadState("networkidle").catch(() => {});
  await sleep(ms);
}

async function ensureGrid(page: Page) {
  if (await page.getByRole("grid", { name: "Table data" }).count()) return;
  await page.goto(`${EXPLORER}?category=tables&name=orders&schema=public`);
  await page.getByRole("grid", { name: "Table data" }).waitFor({ timeout: 20000 });
  await settle(page, 1200);
}

// ---------- single continuous take ----------
type Marker = { id: string; at: number; label: string };

async function take(page: Page, mark: (id: string, label: string) => void) {
  // start on the instance overview (already loaded, warm)
  mark("overview", "Instance overview");
  await glide(page, 700, 420, 450);
  await sleep(500);

  // -> Data Explorer
  const de = await center(page, 'a:has-text("Data Explorer"), button:has-text("Data Explorer")');
  await glide(page, de.x, de.y, 600);
  await sleep(150);
  await clickAt(page, de.x, de.y, 100);
  mark("explorer", "Data Explorer · schema objects");
  await page.locator('td:has-text("orders")').first().waitFor();
  await sleep(1300);

  // -> orders table
  await clickSel(page, 'td:has-text("orders")', 100);
  mark("grid", "public.orders · 40k rows");
  await page.getByRole("grid", { name: "Table data" }).waitFor({ timeout: 20000 });
  await sleep(700);
  await glide(page, 1000, 520, 600);
  await smoothWheel(page, 420, 600);
  await sleep(500);
  await smoothWheel(page, -420, 600);
  await sleep(400);

  // filter: amount > 200
  await clickSel(page, 'button:has-text("Filter")', 350);
  mark("filter", "Filter: amount > 200");
  await page.locator('[role="dialog"][aria-label^="Filter"]').waitFor();
  await clickSel(page, '[role="dialog"][aria-label^="Filter"] [role="combobox"][aria-label="Filter operator"]', 300);
  await clickSel(page, '[role="option"]:visible:has-text("Greater than") >> nth=0', 250);
  await clickSel(page, '[role="dialog"][aria-label^="Filter"] [aria-label="Filter value"]', 120);
  await typeSlow(page, "200", 70);
  await sleep(300);
  await page.keyboard.press("Enter");
  await sleep(500);
  await page.keyboard.press("Escape");
  await settle(page, 1000);

  // foreign key popover
  const btn = page.getByRole("button", { name: /^Open customer_id reference/ }).first();
  const bb = await btn.boundingBox();
  if (!bb) throw new Error("no fk button");
  await clickAt(page, bb.x + Math.min(60, bb.width / 2), bb.y + bb.height / 2, 200);
  mark("fk", "Foreign key → referenced row");
  await page.getByRole("status", { name: "Referenced row loaded" }).waitFor({ timeout: 15000 }).catch(() => {});
  await sleep(1800);
  await page.keyboard.press("Escape");
  await sleep(400);

  // structure tabs
  await clickSel(page, '[role="tab"]:has-text("Indexes")', 200);
  mark("structure", "Indexes · constraints · DDL");
  await settle(page, 1200);
  await clickSel(page, '[role="tab"]:has-text("Definition")', 200);
  await settle(page, 1600);
}

async function main() {
  const browser = await chromium.launch({ headless: true });
  const ctx = await browser.newContext({
    viewport: { width: W, height: H },
    deviceScaleFactor: SCALE,
    colorScheme: "light",
    reducedMotion: "no-preference",
  });
  const page = await ctx.newPage();
  const rec = new Recorder(page);

  // warm-up pass: visit every screen once so assets/data are cached
  await page.goto(`${BASE}/instances/${INSTANCE}`);
  await settle(page, 800);
  await page.goto(`${EXPLORER}`);
  await settle(page, 800);
  await page.goto(`${EXPLORER}?category=tables&name=orders&schema=public`);
  await page.getByRole("grid", { name: "Table data" }).waitFor({ timeout: 20000 });
  await page.getByRole("tab", { name: /^Indexes/ }).click();
  await settle(page, 500);
  await page.getByRole("tab", { name: /^Definition/ }).click();
  await settle(page, 500);
  await page.goto(`${BASE}/instances/${INSTANCE}`);
  await settle(page, 1500);
  await page.mouse.move(900, 600);
  cursorPos = { x: 900, y: 600 };

  const markers: Marker[] = [];
  const mark = (id: string, label: string) => markers.push({ id, at: now(), label });

  await rec.start("take");
  clock0 = performance.now();
  await sleep(300);
  await take(page, mark);
  await sleep(500);
  await rec.stop("take");
  // re-base timestamps on the first captured frame (video t=0)
  const shift = (rec.firstFrameAt - clock0) / 1000;
  for (const m of markers) m.at -= shift;
  for (const e of cursorLog) e.t -= shift;
  writeFileSync(join(import.meta.dirname, "src", "cursor.json"), JSON.stringify(cursorLog));
  await browser.close();
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
