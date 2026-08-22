import { AbsoluteFill, OffthreadVideo, staticFile, useVideoConfig } from "remotion";
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
    </AbsoluteFill>
  );
};
