{
  let theme;
  try {
    theme = globalThis.window.localStorage.getItem("querylane-ui-theme");
  } catch {
    theme = "system";
  }

  if (theme !== "light" && theme !== "dark") {
    theme =
      typeof globalThis.window.matchMedia === "function" &&
      globalThis.window.matchMedia("(prefers-color-scheme: dark)").matches
        ? "dark"
        : "light";
  }

  const root = document.documentElement;
  root.classList.remove("light", "dark");
  root.classList.add(theme);
  root.style.colorScheme = theme;
}
