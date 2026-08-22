import { AbsoluteFill, Img, OffthreadVideo, staticFile, useVideoConfig } from "remotion";
import { Cursor } from "./Cursor";
import { TAKE_H, TAKE_W, WIDTH } from "./theme";

/** Static full-frame take, downscaled to the output size, with a rendered cursor on top. */
export const Screen = ({ takeSec }: { takeSec: number }) => {
  const { fps } = useVideoConfig();
  return (
    <AbsoluteFill style={{ overflow: "hidden", background: "#fff" }}>
      <div
        style={{
          width: TAKE_W,
          height: TAKE_H,
          transformOrigin: "top left",
          transform: `scale(${WIDTH / TAKE_W})`,
        }}
      >
        <OffthreadVideo
          src={staticFile("clips/take.mp4")}
          style={{ width: TAKE_W, height: TAKE_H }}
          muted
          endAt={Math.round(takeSec * fps)}
        />
        <Cursor />
      </div>
      <Watermark />
    </AbsoluteFill>
  );
};

const Watermark = () => (
  <div
    style={{
      position: "absolute",
      right: 18,
      bottom: 16,
      display: "flex",
      alignItems: "center",
      gap: 8,
      padding: "6px 12px 6px 8px",
      borderRadius: 999,
      background: "rgba(24,24,27,0.82)",
      color: "#fafafa",
      fontFamily: "Geist, Inter, system-ui, sans-serif",
      fontSize: 16,
      fontWeight: 600,
      letterSpacing: -0.2,
      boxShadow: "0 2px 10px rgba(0,0,0,0.25)",
    }}
  >
    <Img src={staticFile("icon.svg")} style={{ width: 20, height: 20 }} />
    Querylane
  </div>
);
