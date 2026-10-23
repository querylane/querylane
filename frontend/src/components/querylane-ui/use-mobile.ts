import { useSyncExternalStore } from "react";

const MOBILE_BREAKPOINT = 1024;
const MOBILE_QUERY = `(max-width: ${MOBILE_BREAKPOINT - 1}px)`;
function subscribe(onChange: () => void) {
  const media = globalThis.window.matchMedia(MOBILE_QUERY);
  media.addEventListener("change", onChange);
  return () => {
    media.removeEventListener("change", onChange);
  };
}
function getSnapshot() {
  return globalThis.window.matchMedia(MOBILE_QUERY).matches;
}
function getServerSnapshot() {
  return false;
}
function useIsMobile() {
  return useSyncExternalStore(subscribe, getSnapshot, getServerSnapshot);
}

export { useIsMobile };
