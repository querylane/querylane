import { Easing, interpolate, useCurrentFrame, useVideoConfig } from "remotion";
import cursorJson from "./cursor.json";

type Ev =
  | { t: number; type: "move"; x: number; y: number; dur: number }
  | { t: number; type: "down"; x: number; y: number }
  | { t: number; type: "up"; x: number; y: number };

const events = cursorJson as Ev[];
const moves = events.filter((e): e is Extract<Ev, { type: "move" }> => e.type === "move");
const downs = events.filter((e) => e.type === "down");
const ups = events.filter((e) => e.type === "up");

const ease = Easing.bezier(0.22, 1, 0.36, 1); // "easeOutQuint"-ish: fast start, soft landing

/** Cursor position (take-space px) at time t. */
export const cursorAt = (t: number) => {
  let x = 900;
  let y = 600;
  let prevX = x;
  let prevY = y;
  for (const m of moves) {
    if (t < m.t) break;
    const k = interpolate(t, [m.t, m.t + Math.max(m.dur, 0.05)], [0, 1], {
      extrapolateLeft: "clamp",
      extrapolateRight: "clamp",
      easing: ease,
    });
    x = prevX + (m.x - prevX) * k;
    y = prevY + (m.y - prevY) * k;
    if (t >= m.t + m.dur) {
      prevX = m.x;
      prevY = m.y;
    }
  }
  return { x, y };
};

/** Most recent mouse-down before t (for camera nudge / press state). */
export const lastClickBefore = (t: number) => {
  let last: { t: number; x: number; y: number } | null = null;
  for (const d of downs) if (d.t <= t) last = d;
  return last;
};

export const Cursor = () => {
  const frame = useCurrentFrame();
  const { fps } = useVideoConfig();
  const t = frame / fps;
  const { x, y } = cursorAt(t);

  // pressed state between down and up
  const down = lastClickBefore(t);
  const up = ups.find((u) => down && u.t >= down.t);
  const pressed = !!down && (!up || t < up.t);
  const scale = pressed ? 0.82 : 1;

  return (
    <>
      {downs.map((d) => {
        const age = t - d.t;
        if (age < 0 || age > 0.55) return null;
        const k = age / 0.55;
        return (
          <div
            key={d.t}
            style={{
              position: "absolute",
              left: d.x,
              top: d.y,
              width: 72,
              height: 72,
              marginLeft: -36,
              marginTop: -36,
              borderRadius: 999,
              border: "3px solid #3b82f6",
              opacity: (1 - k) * 0.9,
              transform: `scale(${0.3 + k * 1.1})`,
            }}
          />
        );
      })}
      <svg
        height="62"
        style={{
          position: "absolute",
          left: x - 4,
          top: y - 3,
          transform: `scale(${scale})`,
          transformOrigin: "4px 3px",
          filter: "drop-shadow(0 4px 8px rgba(0,0,0,0.45))",
        }}
        viewBox="0 0 28 36"
        width="48"
      >
        <path
          d="M3 2 L3 28 L9.5 22 L14 32 L19 30 L14.5 20 L23 20 Z"
          fill="#18181b"
          stroke="#fafafa"
          strokeLinejoin="round"
          strokeWidth="2.4"
        />
      </svg>
    </>
  );
};
