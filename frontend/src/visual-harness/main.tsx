import { StrictMode } from "react";
import { createRoot } from "react-dom/client";
import { VisualHarness } from "@/visual-harness/visual-harness";
import "../index.css";

// Test-only entry. rsbuild adds it only when QUERYLANE_VISUAL_HARNESS=1, so the
// production bundle never ships it.
const rootElement = document.getElementById("root");

if (rootElement) {
  const scenario =
    new URLSearchParams(window.location.search).get("scenario") ?? "";

  createRoot(rootElement).render(
    <StrictMode>
      <VisualHarness scenario={scenario} />
    </StrictMode>
  );
}
