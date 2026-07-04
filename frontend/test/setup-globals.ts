// Build-time constants that rsbuild's `define` replaces at compile time.
// In the test environment we provide sensible defaults.
(globalThis as Record<string, unknown>)["__API_BASE_URL__"] = "";
