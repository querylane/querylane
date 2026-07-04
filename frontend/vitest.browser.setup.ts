import "./vitest.browser.setup.css";

const consoleWarnPatchFlag = Symbol.for("querylane.test.console-warn-patched");
const screenshotFrameScale = "0.72";

if (!Reflect.get(globalThis, consoleWarnPatchFlag)) {
  const testConsole = globalThis.console;
  const originalConsoleWarn = testConsole.warn.bind(testConsole);
  testConsole.warn = (...args: unknown[]) => {
    originalConsoleWarn("[console.warn]", ...args);
  };
  Reflect.set(globalThis, consoleWarnPatchFlag, true);
}

const browserTheme =
  import.meta.env["VITE_BROWSER_THEME"] === "dark" ? "dark" : "light";

document.documentElement.classList.remove("light", "dark");
document.documentElement.classList.add(browserTheme);
document.documentElement.dataset["visualTheme"] = browserTheme;
document.documentElement.dataset["testMotion"] = "reduced";
document.documentElement.style.colorScheme = browserTheme;

if (window.frameElement?.tagName === "IFRAME") {
  const frameElement = window.frameElement as HTMLIFrameElement;
  frameElement.style.transform = `scale(${screenshotFrameScale})`;
  frameElement.style.transformOrigin = "left top";
}
