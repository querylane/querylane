import { Composition } from "remotion";
import { Demo, demoDurationInFrames } from "./Demo";
import { FPS, HEIGHT, WIDTH } from "./theme";

export const Root = () => (
  <Composition
    component={Demo}
    durationInFrames={demoDurationInFrames}
    fps={FPS}
    height={HEIGHT}
    id="QuerylaneDemo"
    width={WIDTH}
  />
);
