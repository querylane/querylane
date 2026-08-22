import { AbsoluteFill } from "remotion";
import { Screen } from "./Screen";
import { FPS } from "./theme";

const TAKE_SEC = 23.2;
export const demoDurationInFrames = Math.round(TAKE_SEC * FPS);

export const Demo = () => (
  <AbsoluteFill style={{ background: "#fff" }}>
    <Screen takeSec={TAKE_SEC} />
  </AbsoluteFill>
);
