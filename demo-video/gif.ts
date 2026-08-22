/**
 * out/querylane-demo.mp4 -> docs/media/querylane-demo.gif (README embed).
 * 960px wide, 12 fps, 128-colour diff palette, then gifsicle -O3 --lossy.
 * Budget: keep the result under ~6 MB. Tune WIDTH/FPS/COLORS if the take grows.
 */
import { execFileSync } from "node:child_process";
import { statSync } from "node:fs";
import { join } from "node:path";

const WIDTH = 960;
const FPS = 12;
const COLORS = 128;
const LOSSY = 60;
const BUDGET_MB = 6;

const src = join(import.meta.dirname, "out", "querylane-demo.mp4");
const tmp = join(import.meta.dirname, "out", "querylane-demo.raw.gif");
const out = join(import.meta.dirname, "..", "docs", "media", "querylane-demo.gif");

const vf =
  `fps=${FPS},scale=${WIDTH}:-1:flags=lanczos,split[s0][s1];` +
  `[s0]palettegen=max_colors=${COLORS}:stats_mode=diff[p];` +
  `[s1][p]paletteuse=dither=none:diff_mode=rectangle`;

execFileSync("ffmpeg", ["-y", "-loglevel", "error", "-i", src, "-vf", vf, tmp], { stdio: "inherit" });
execFileSync("gifsicle", ["-O3", `--lossy=${LOSSY}`, "-o", out, tmp], { stdio: "inherit" });

const mb = statSync(out).size / 1e6;
console.log(`✔ ${out} (${mb.toFixed(1)} MB)`);
if (mb > BUDGET_MB) {
  console.error(`✖ GIF exceeds ${BUDGET_MB} MB budget — shorten the take or lower WIDTH/FPS/COLORS.`);
  process.exit(1);
}
