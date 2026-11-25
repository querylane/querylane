import { createEnvironment } from "@miaskiewicz/turbo-dom/runtime";
import { afterAll } from "@rstest/core";
import { reportTestRuntimeError } from "./test.console-guard";

const environment = createEnvironment(undefined, {
  url: "http://localhost:3000",
});
const browserWindow: unknown = environment.window;
if (typeof browserWindow !== "object" || browserWindow === null) {
  throw new TypeError("turbo-dom did not provide a window object");
}

const originals = new Map<string, PropertyDescriptor | undefined>();
const selfKeys = new Set(["window", "self", "parent", "top", "frames"]);
const browserOwnedGlobals = new Set([
  "CustomEvent",
  "Event",
  "EventTarget",
  "navigator",
]);

// turbo-dom implements TreeWalker but does not publish its standard constants.
Reflect.set(browserWindow, "NodeFilter", {
  FILTER_ACCEPT: 1,
  FILTER_REJECT: 2,
  FILTER_SKIP: 3,
  SHOW_ALL: 0xff_ff_ff_ff,
  SHOW_ELEMENT: 1,
  SHOW_ATTRIBUTE: 2,
  SHOW_TEXT: 4,
  SHOW_CDATA_SECTION: 8,
  SHOW_ENTITY_REFERENCE: 16,
  SHOW_ENTITY: 32,
  SHOW_PROCESSING_INSTRUCTION: 64,
  SHOW_COMMENT: 128,
  SHOW_DOCUMENT: 256,
  SHOW_DOCUMENT_TYPE: 512,
  SHOW_DOCUMENT_FRAGMENT: 1024,
  SHOW_NOTATION: 2048,
});
Reflect.set(browserWindow, "reportError", reportTestRuntimeError);
const globalNames = new Set([
  ...selfKeys,
  ...environment.globalKeys,
  "NodeFilter",
]);

for (const name of globalNames) {
  // Keep Node's real fetch, timers, performance and web APIs. In particular,
  // turbo-dom's fetch delegates to globalThis.fetch and cannot replace itself.
  // Route reportError through the existing console guard instead of swallowing it.
  if (Reflect.has(globalThis, name) && !browserOwnedGlobals.has(name)) {
    continue;
  }

  originals.set(name, Object.getOwnPropertyDescriptor(globalThis, name));
  Object.defineProperty(globalThis, name, {
    configurable: true,
    enumerable: true,
    get(): unknown {
      return selfKeys.has(name) ? globalThis : Reflect.get(browserWindow, name);
    },
    set(value: unknown) {
      Object.defineProperty(globalThis, name, {
        configurable: true,
        enumerable: true,
        writable: true,
        value,
      });
    },
  });
}

Reflect.set(environment.document, "defaultView", globalThis);

afterAll(function restoreTurboDomGlobals() {
  for (const [name, descriptor] of originals) {
    if (descriptor) {
      Object.defineProperty(globalThis, name, descriptor);
    } else {
      Reflect.deleteProperty(globalThis, name);
    }
  }
});
