// Runs before React. Keep the storage key and system fallback aligned with
// ThemeProvider; startup E2E tests cover the handoff to the mounted provider.
(() => {
  let theme;
  try {
    theme = window.localStorage.getItem("querylane-ui-theme");
  } catch {
    // Storage can be unavailable in restricted browsing contexts.
    theme = "system";
  }

  if (theme !== "light" && theme !== "dark") {
    theme =
      typeof window.matchMedia === "function" &&
      window.matchMedia("(prefers-color-scheme: dark)").matches
        ? "dark"
        : "light";
  }

  const root = document.documentElement;
  root.classList.remove("light", "dark");
  root.classList.add(theme);
  root.style.colorScheme = theme;
})();
