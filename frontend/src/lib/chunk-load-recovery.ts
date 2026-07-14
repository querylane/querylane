const TANSTACK_MODULE_NOT_FOUND_ERROR_PREFIXES = [
  "Failed to fetch dynamically imported module",
  "error loading dynamically imported module",
  "Importing a module script failed",
] as const;
const RSPACK_CHUNK_LOAD_ERROR_PATTERNS = [/loading (?:css )?chunk \S+ failed/i];
const TANSTACK_ROUTER_RELOAD_KEY_PREFIX = "tanstack_router_reload:";

interface ChunkLoadReloadAttemptOptions {
  error: unknown;
  storage: Storage;
}

interface ReloadChunkLoadErrorOptions extends ChunkLoadReloadAttemptOptions {
  reloadPage: () => void;
}

function readErrorMessage(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}

function isTanStackModuleNotFoundError(error: unknown): boolean {
  const message = readErrorMessage(error);
  return TANSTACK_MODULE_NOT_FOUND_ERROR_PREFIXES.some((prefix) =>
    message.startsWith(prefix)
  );
}

function isRspackChunkLoadError(error: unknown): boolean {
  const message = readErrorMessage(error);
  return RSPACK_CHUNK_LOAD_ERROR_PATTERNS.some((pattern) =>
    pattern.test(message)
  );
}

function isChunkLoadError(error: unknown): boolean {
  return isTanStackModuleNotFoundError(error) || isRspackChunkLoadError(error);
}

function getChunkLoadReloadStorageKey(error: unknown): string {
  return `${TANSTACK_ROUTER_RELOAD_KEY_PREFIX}${readErrorMessage(error)}`;
}

function hasChunkLoadReloadAttempt({
  error,
  storage,
}: ChunkLoadReloadAttemptOptions): boolean {
  try {
    return storage.getItem(getChunkLoadReloadStorageKey(error)) === "1";
  } catch {
    return true;
  }
}

function reserveChunkLoadReloadAttempt({
  error,
  storage,
}: ChunkLoadReloadAttemptOptions): boolean {
  try {
    if (hasChunkLoadReloadAttempt({ error, storage })) {
      return false;
    }
    storage.setItem(getChunkLoadReloadStorageKey(error), "1");
    return true;
  } catch {
    return false;
  }
}

function getChunkLoadSessionStorage(): Storage | undefined {
  if (typeof window === "undefined") {
    return;
  }

  let storage: Storage | undefined;
  try {
    storage = window.sessionStorage;
  } catch {
    // Session storage can be unavailable in privacy-restricted contexts.
  }
  return storage;
}

function reloadChunkLoadErrorOnce({
  error,
  reloadPage,
  storage,
}: ReloadChunkLoadErrorOptions): boolean {
  if (!reserveChunkLoadReloadAttempt({ error, storage })) {
    return false;
  }

  reloadPage();
  return true;
}

export {
  getChunkLoadSessionStorage,
  isChunkLoadError,
  reloadChunkLoadErrorOnce,
  reserveChunkLoadReloadAttempt,
};
