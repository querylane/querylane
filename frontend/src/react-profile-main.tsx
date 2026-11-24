// Deliberately separate build entry. No runtime switch in the normal application.
import "./main";

declare const QUERYLANE_REACT_PROFILE_BUILD: {
  revision: string;
  sourceDigest: string;
  configDigest: string;
};
globalThis.window.querylaneReactProfileBuild = QUERYLANE_REACT_PROFILE_BUILD;
