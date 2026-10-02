import type { Page } from "playwright/test";

// Chromium headless has no dependable installed OS voices. Keep UI evidence
// deterministic; this exercises Blume's controls, not audible voice quality.
export const installBrowserVoice = async (page: Page) => {
  await page.addInitScript(() => {
    let speaking = false;
    let paused = false;
    const voice = {
      default: true,
      lang: "en-US",
      localService: true,
      name: "Test English",
    };
    const synthesis = Object.assign(new EventTarget(), {
      getVoices: () => [voice],
      speak: (utterance: SpeechSynthesisUtterance) => {
        speaking = true;
        paused = false;
        utterance.dispatchEvent(new SpeechSynthesisEvent("start"));
      },
      cancel: () => {
        speaking = false;
        paused = false;
      },
      pause: () => {
        paused = true;
      },
      resume: () => {
        paused = false;
      },
    });
    Object.defineProperties(synthesis, {
      speaking: { get: () => speaking },
      paused: { get: () => paused },
      pending: { get: () => false },
    });
    Object.defineProperty(SpeechSynthesisUtterance.prototype, "voice", {
      value: null,
      writable: true,
    });
    Object.defineProperty(window, "speechSynthesis", { value: synthesis });
  });
};
