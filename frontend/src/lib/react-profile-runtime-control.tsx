import { Profiler } from "react";
import { createRoot } from "react-dom/client";
import { createReactProfileRecorder } from "./react-profile-recorder";

const PROFILE_ID = "application";
const BASE_WORK = 1_000_000;
const rootElement = document.querySelector("#root");
if (!rootElement) {
  throw new Error("Missing runtime control root");
}
const root = createRoot(rootElement);
const recorder = createReactProfileRecorder();
globalThis.window.querylaneReactProfile = recorder;
let iteration = 0;

function RenderWork({ units, sequence }: { units: number; sequence: number }) {
  let sum = 0;
  for (let index = 0; index < units; index += 1) {
    sum += Math.sqrt(index + sequence);
  }
  return (
    <output data-sequence={sequence} data-units={units}>
      {sum}
    </output>
  );
}

globalThis.window.querylaneProfileControl = {
  render(units) {
    iteration += 1;
    root.render(
      <Profiler id={PROFILE_ID} onRender={recorder.handleRender}>
        <RenderWork sequence={iteration} units={units} />
      </Profiler>
    );
    return iteration;
  },
};
globalThis.window.querylaneProfileControl.render(BASE_WORK);

export { RenderWork };
