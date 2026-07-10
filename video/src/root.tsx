import { Composition } from "remotion";
import { SHOWCASE_DURATION, Showcase } from "./showcase";

export function RemotionRoot() {
  return (
    <Composition
      component={Showcase}
      durationInFrames={SHOWCASE_DURATION}
      fps={30}
      height={1080}
      id="querylane-showcase"
      width={1920}
    />
  );
}
