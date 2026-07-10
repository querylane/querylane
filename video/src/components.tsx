import type { CSSProperties, ReactNode } from "react";
import {
  AbsoluteFill,
  interpolate,
  spring,
  useCurrentFrame,
  useVideoConfig,
} from "remotion";
import { fonts, theme } from "./theme";

// --- Querylane logo mark (recreated from the product's SVG) ---

export function LogoMark({ size = 96 }: { size?: number }) {
  return (
    <svg viewBox="0 0 32 32" width={size} height={size}>
      <rect fill={theme.panel} height="32" rx="7" width="32" />
      <rect
        fill={theme.text}
        height="4.5"
        opacity={0.08}
        rx="1.5"
        width="26"
        x="3"
        y="13"
      />
      <rect fill={theme.text} height="2.2" opacity="0.35" rx="1" width="12" x="9" y="6.5" />
      <rect fill={theme.text} height="2.2" opacity="0.5" rx="1" width="14" x="12" y="10.5" />
      <rect fill={theme.text} height="2.2" rx="1" width="10" x="12" y="14.2" />
      <rect fill={theme.text} height="2.2" opacity="0.5" rx="1" width="15" x="12" y="18" />
      <rect fill={theme.text} height="2.2" opacity="0.35" rx="1" width="8" x="9" y="22" />
      <path d="M4.5 13.3L8 15.2L4.5 17.1Z" fill={theme.accent} />
    </svg>
  );
}

// --- Ambient dotted-grid background used across scenes ---

export function GridBackground() {
  return (
    <AbsoluteFill
      style={{
        backgroundColor: theme.bg,
        backgroundImage: `radial-gradient(${theme.border} 1px, transparent 1px)`,
        backgroundSize: "36px 36px",
      }}
    >
      <AbsoluteFill
        style={{
          background: `radial-gradient(ellipse 80% 60% at 50% 40%, transparent 30%, ${theme.bg} 100%)`,
        }}
      />
    </AbsoluteFill>
  );
}

// --- Scene-level fade in/out wrapper ---

export function SceneFade({
  children,
  fadeFrames = 12,
}: {
  children: ReactNode;
  fadeFrames?: number;
}) {
  const frame = useCurrentFrame();
  const { durationInFrames } = useVideoConfig();
  const opacity = interpolate(
    frame,
    [0, fadeFrames, durationInFrames - fadeFrames, durationInFrames],
    [0, 1, 1, 0],
    { extrapolateLeft: "clamp", extrapolateRight: "clamp" },
  );
  return <AbsoluteFill style={{ opacity }}>{children}</AbsoluteFill>;
}

// --- Section kicker + headline ---

export function SceneTitle({
  kicker,
  title,
  delay = 0,
}: {
  kicker: string;
  title: string;
  delay?: number;
}) {
  const frame = useCurrentFrame();
  const { fps } = useVideoConfig();
  const progress = spring({
    frame: frame - delay,
    fps,
    config: { damping: 200 },
  });
  const y = interpolate(progress, [0, 1], [24, 0]);
  return (
    <div
      style={{
        position: "absolute",
        top: 64,
        left: 96,
        right: 96,
        opacity: progress,
        transform: `translateY(${y}px)`,
        fontFamily: fonts.sans,
      }}
    >
      <div
        style={{
          color: theme.accent,
          fontFamily: fonts.mono,
          fontSize: 22,
          letterSpacing: "0.22em",
          textTransform: "uppercase",
          marginBottom: 14,
        }}
      >
        {kicker}
      </div>
      <div style={{ color: theme.text, fontSize: 54, fontWeight: 700, letterSpacing: "-0.02em" }}>
        {title}
      </div>
    </div>
  );
}

// --- Feature chip (pill) with springy entrance ---

export function Chip({
  label,
  delay,
  style,
}: {
  label: string;
  delay: number;
  style?: CSSProperties;
}) {
  const frame = useCurrentFrame();
  const { fps } = useVideoConfig();
  const progress = spring({
    frame: frame - delay,
    fps,
    config: { damping: 14, mass: 0.6 },
  });
  return (
    <div
      style={{
        display: "inline-flex",
        alignItems: "center",
        gap: 12,
        padding: "14px 26px",
        borderRadius: 999,
        border: `1.5px solid ${theme.border}`,
        backgroundColor: "rgba(24, 24, 27, 0.92)",
        color: theme.text,
        fontFamily: fonts.sans,
        fontSize: 26,
        fontWeight: 600,
        boxShadow: "0 12px 40px rgba(0,0,0,0.5)",
        opacity: Math.min(progress, 1),
        transform: `scale(${interpolate(progress, [0, 1], [0.7, 1])})`,
        ...style,
      }}
    >
      <span
        style={{
          width: 10,
          height: 10,
          borderRadius: 999,
          backgroundColor: theme.accent,
          flexShrink: 0,
        }}
      />
      {label}
    </div>
  );
}

// --- Browser chrome around screenshots / clips ---

export function BrowserFrame({
  url,
  children,
  style,
}: {
  url: string;
  children: ReactNode;
  style?: CSSProperties;
}) {
  return (
    <div
      style={{
        borderRadius: 18,
        border: `1.5px solid ${theme.border}`,
        backgroundColor: theme.bgRaised,
        boxShadow: "0 40px 120px rgba(0,0,0,0.65)",
        overflow: "hidden",
        display: "flex",
        flexDirection: "column",
        ...style,
      }}
    >
      <div
        style={{
          display: "flex",
          alignItems: "center",
          gap: 16,
          padding: "16px 22px",
          borderBottom: `1px solid ${theme.border}`,
          flexShrink: 0,
        }}
      >
        <div style={{ display: "flex", gap: 9 }}>
          {["#ff5f57", "#febc2e", "#28c840"].map((c) => (
            <div
              key={c}
              style={{ width: 14, height: 14, borderRadius: 999, backgroundColor: c }}
            />
          ))}
        </div>
        <div
          style={{
            flex: 1,
            maxWidth: 720,
            margin: "0 auto",
            padding: "8px 18px",
            borderRadius: 10,
            backgroundColor: theme.panel,
            color: theme.textMuted,
            fontFamily: fonts.mono,
            fontSize: 19,
            textAlign: "center",
            whiteSpace: "nowrap",
            overflow: "hidden",
            textOverflow: "ellipsis",
          }}
        >
          {url}
        </div>
        <div style={{ width: 60 }} />
      </div>
      <div style={{ position: "relative", flex: 1, overflow: "hidden" }}>{children}</div>
    </div>
  );
}

// --- Ken Burns (slow zoom/pan) wrapper for stills ---

export function KenBurns({
  children,
  from = 1,
  to = 1.08,
  originX = 50,
  originY = 30,
}: {
  children: ReactNode;
  from?: number;
  to?: number;
  originX?: number;
  originY?: number;
}) {
  const frame = useCurrentFrame();
  const { durationInFrames } = useVideoConfig();
  const scale = interpolate(frame, [0, durationInFrames], [from, to]);
  return (
    <div
      style={{
        width: "100%",
        height: "100%",
        transform: `scale(${scale})`,
        transformOrigin: `${originX}% ${originY}%`,
      }}
    >
      {children}
    </div>
  );
}
