import { Profiler, type ReactNode } from "react";
import { createRoot, type RootOptions } from "react-dom/client";
import { createReactProfileRecorder } from "./react-profile-recorder";

const PROFILE_ID = "application";

export function renderRoot(
  element: Element,
  options: RootOptions,
  children: ReactNode
) {
  const recorder = createReactProfileRecorder();
  globalThis.window.querylaneReactProfile = recorder;
  // The profile-only build aliases createRoot to the supported production profiling runtime.
  createRoot(element, options).render(
    <Profiler id={PROFILE_ID} onRender={recorder.handleRender}>
      {children}
    </Profiler>
  );
}
